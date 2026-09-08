import { db as defaultDb, socialAccounts, workspaces, type Db } from "@sma/db";
import { and, eq } from "drizzle-orm";

export interface InstagramCredentials {
  igUserId: string;
  accessToken: string;
}

export interface InstagramEnv {
  INSTAGRAM_USER_ID?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
}

/** Refresh when the token is unknown-expiry or expires within this window. */
export const REFRESH_MARGIN_MS = 10 * 24 * 60 * 60 * 1000;
/** Meta long-lived user tokens last ~60 days; assumed when the API omits expires_in. */
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;

const GRAPH_API_VERSION = "v23.0";

export async function findInstagramAccount(deps: { db?: Db } = {}) {
  const db = deps.db ?? defaultDb;
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.platform, "instagram"), eq(socialAccounts.status, "active")))
    .limit(1);
  return account ?? null;
}

/**
 * Credentials for publish/analytics. Source of truth is the social_accounts
 * row; the env vars only bootstrap it on first use so an operator can paste
 * a token once and the refresh job takes over from there. Returns null when
 * Instagram isn't configured at all - callers skip instead of failing.
 */
export async function getInstagramCredentials(
  deps: { db?: Db; env?: InstagramEnv } = {},
): Promise<InstagramCredentials | null> {
  const db = deps.db ?? defaultDb;
  const env: InstagramEnv = deps.env ?? (process.env as InstagramEnv);

  const existing = await findInstagramAccount({ db });
  if (existing?.accessToken) {
    return { igUserId: existing.externalAccountId, accessToken: existing.accessToken };
  }

  const igUserId = env.INSTAGRAM_USER_ID;
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN;
  if (!igUserId || !accessToken) return null;

  if (existing) {
    // Row exists from an earlier schema (accessTokenRef era) - adopt it.
    await db
      .update(socialAccounts)
      .set({ externalAccountId: igUserId, accessToken, accessTokenExpiresAt: null, tokenError: null })
      .where(eq(socialAccounts.id, existing.id));
    return { igUserId, accessToken };
  }

  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) throw new Error("No workspace found - run the seed first");

  await db.insert(socialAccounts).values({
    workspaceId: workspace.id,
    platform: "instagram",
    externalAccountId: igUserId,
    accessToken,
    accessTokenExpiresAt: null,
  });
  return { igUserId, accessToken };
}

export type RefreshResult =
  | { status: "skipped"; reason: "not_configured" | "not_due" | "missing_app_credentials" }
  | { status: "refreshed"; expiresAt: Date }
  | { status: "failed"; error: string };

interface ExchangeResponse {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string };
}

/**
 * Keeps the long-lived token alive. Meta's long-lived user tokens expire
 * after ~60 days; exchanging a still-valid one via `fb_exchange_token`
 * returns a fresh 60-day token (a short-lived token from the Graph API
 * Explorer is upgraded the same way). Runs daily from the worker; only
 * talks to Meta when the expiry is unknown or inside REFRESH_MARGIN_MS.
 */
export async function refreshInstagramTokenIfNeeded(
  deps: { db?: Db; env?: InstagramEnv; fetch?: typeof fetch; now?: () => Date } = {},
): Promise<RefreshResult> {
  const db = deps.db ?? defaultDb;
  const env: InstagramEnv = deps.env ?? (process.env as InstagramEnv);
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ? deps.now() : new Date();

  // Bootstraps the row from env if this is the first run.
  const creds = await getInstagramCredentials({ db, env });
  if (!creds) return { status: "skipped", reason: "not_configured" };
  const account = await findInstagramAccount({ db });
  if (!account) return { status: "skipped", reason: "not_configured" };

  const expiresAt = account.accessTokenExpiresAt;
  if (expiresAt && expiresAt.getTime() - now.getTime() > REFRESH_MARGIN_MS) {
    return { status: "skipped", reason: "not_due" };
  }

  const appId = env.INSTAGRAM_APP_ID;
  const appSecret = env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    await db
      .update(socialAccounts)
      .set({ tokenError: "INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET not set - token cannot be refreshed" })
      .where(eq(socialAccounts.id, account.id));
    return { status: "skipped", reason: "missing_app_credentials" };
  }

  try {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: creds.accessToken,
    });
    const res = await doFetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params}`,
    );
    const body = (await res.json().catch(() => ({}))) as ExchangeResponse;
    if (!res.ok || !body.access_token) {
      throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }

    const lifetimeMs = body.expires_in ? body.expires_in * 1000 : DEFAULT_TOKEN_LIFETIME_MS;
    const newExpiresAt = new Date(now.getTime() + lifetimeMs);
    await db
      .update(socialAccounts)
      .set({
        accessToken: body.access_token,
        accessTokenExpiresAt: newExpiresAt,
        accessTokenRefreshedAt: now,
        tokenError: null,
      })
      .where(eq(socialAccounts.id, account.id));
    return { status: "refreshed", expiresAt: newExpiresAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(socialAccounts)
      .set({ tokenError: message })
      .where(eq(socialAccounts.id, account.id));
    return { status: "failed", error: message };
  }
}
