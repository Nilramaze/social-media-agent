import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { db, socialAccounts, workspaces } from "@sma/db";
import { eq } from "drizzle-orm";
import {
  getInstagramCredentials,
  REFRESH_MARGIN_MS,
  refreshInstagramTokenIfNeeded,
} from "./credentials";

const DAY_MS = 24 * 60 * 60 * 1000;

async function withCleanInstagramState<T>(fn: () => Promise<T>): Promise<T> {
  // These helpers pick the first active instagram row globally, so tests
  // must not run against a populated table.
  const before = await db.select().from(socialAccounts).where(eq(socialAccounts.platform, "instagram"));
  assert.equal(before.length, 0, "instagram social_accounts row already present - test DB not clean");
  const [workspace] = await db.insert(workspaces).values({ name: `test-${randomUUID()}` }).returning();
  try {
    return await fn();
  } finally {
    await db.delete(socialAccounts).where(eq(socialAccounts.platform, "instagram"));
    if (workspace) await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
  }
}

function fakeFetch(handler: (url: string) => { ok: boolean; status: number; body: unknown }) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = handler(url);
    return { ok: r.ok, status: r.status, json: async () => r.body } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

test("getInstagramCredentials seeds the row from env once, then reads from the DB", async () => {
  await withCleanInstagramState(async () => {
    const env = { INSTAGRAM_USER_ID: "1789", INSTAGRAM_ACCESS_TOKEN: "env-token" };
    const first = await getInstagramCredentials({ env });
    assert.deepEqual(first, { igUserId: "1789", accessToken: "env-token" });

    await db
      .update(socialAccounts)
      .set({ accessToken: "rotated-token" })
      .where(eq(socialAccounts.platform, "instagram"));

    // A stale env value must not win over the stored, rotated token.
    const second = await getInstagramCredentials({ env });
    assert.deepEqual(second, { igUserId: "1789", accessToken: "rotated-token" });
  });
});

test("getInstagramCredentials returns null when nothing is configured", async () => {
  await withCleanInstagramState(async () => {
    assert.equal(await getInstagramCredentials({ env: {} }), null);
  });
});

test("refresh exchanges the token when expiry is unknown and stores the new one", async () => {
  await withCleanInstagramState(async () => {
    const now = new Date("2026-09-08T12:00:00Z");
    const { fn, calls } = fakeFetch(() => ({
      ok: true,
      status: 200,
      body: { access_token: "new-long-lived", token_type: "bearer", expires_in: 5184000 },
    }));

    const result = await refreshInstagramTokenIfNeeded({
      env: {
        INSTAGRAM_USER_ID: "1789",
        INSTAGRAM_ACCESS_TOKEN: "short-lived",
        INSTAGRAM_APP_ID: "app",
        INSTAGRAM_APP_SECRET: "secret",
      },
      fetch: fn,
      now: () => now,
    });

    assert.equal(result.status, "refreshed");
    assert.equal(calls.length, 1);
    assert.match(calls[0]!, /grant_type=fb_exchange_token/);
    assert.match(calls[0]!, /fb_exchange_token=short-lived/);

    const [row] = await db.select().from(socialAccounts).where(eq(socialAccounts.platform, "instagram"));
    assert.equal(row?.accessToken, "new-long-lived");
    assert.equal(row?.accessTokenExpiresAt?.getTime(), now.getTime() + 5184000 * 1000);
    assert.equal(row?.tokenError, null);

    // Far from expiry now -> no API call.
    const again = await refreshInstagramTokenIfNeeded({
      env: { INSTAGRAM_APP_ID: "app", INSTAGRAM_APP_SECRET: "secret" },
      fetch: fn,
      now: () => new Date(now.getTime() + DAY_MS),
    });
    assert.deepEqual(again, { status: "skipped", reason: "not_due" });
    assert.equal(calls.length, 1);

    // Inside the margin -> refresh again.
    const due = await refreshInstagramTokenIfNeeded({
      env: { INSTAGRAM_APP_ID: "app", INSTAGRAM_APP_SECRET: "secret" },
      fetch: fn,
      now: () => new Date(now.getTime() + 5184000 * 1000 - REFRESH_MARGIN_MS + DAY_MS),
    });
    assert.equal(due.status, "refreshed");
    assert.equal(calls.length, 2);
    assert.match(calls[1]!, /fb_exchange_token=new-long-lived/);
  });
});

test("refresh records the API error and keeps the old token", async () => {
  await withCleanInstagramState(async () => {
    const { fn } = fakeFetch(() => ({
      ok: false,
      status: 400,
      body: { error: { message: "Error validating access token: Session has expired" } },
    }));
    const result = await refreshInstagramTokenIfNeeded({
      env: {
        INSTAGRAM_USER_ID: "1789",
        INSTAGRAM_ACCESS_TOKEN: "old",
        INSTAGRAM_APP_ID: "app",
        INSTAGRAM_APP_SECRET: "secret",
      },
      fetch: fn,
    });
    assert.equal(result.status, "failed");
    const [row] = await db.select().from(socialAccounts).where(eq(socialAccounts.platform, "instagram"));
    assert.equal(row?.accessToken, "old");
    assert.match(row?.tokenError ?? "", /Session has expired/);
  });
});

test("refresh without app credentials is skipped and flagged on the row", async () => {
  await withCleanInstagramState(async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, status: 200, body: {} }));
    const result = await refreshInstagramTokenIfNeeded({
      env: { INSTAGRAM_USER_ID: "1789", INSTAGRAM_ACCESS_TOKEN: "t" },
      fetch: fn,
    });
    assert.deepEqual(result, { status: "skipped", reason: "missing_app_credentials" });
    assert.equal(calls.length, 0);
    const [row] = await db.select().from(socialAccounts).where(eq(socialAccounts.platform, "instagram"));
    assert.match(row?.tokenError ?? "", /INSTAGRAM_APP_ID/);
  });
});

after(async () => {
  await db.$client.end();
});
