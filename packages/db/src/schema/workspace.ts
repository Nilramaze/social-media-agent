import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const workspaces = pgTable("workspaces", {
  id: idColumn(),
  name: text("name").notNull(),
  createdAt: createdAtColumn(),
});

export const brandProfiles = pgTable("brand_profiles", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  voice: text("voice").notNull(),
  guidelines: text("guidelines").notNull(),
  targetAudience: text("target_audience").notNull(),
  createdAt: createdAtColumn(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const socialAccountPlatformValues = ["instagram"] as const;
export const socialAccountStatusValues = ["active", "disabled"] as const;

export const socialAccounts = pgTable("social_accounts", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  platform: text("platform", { enum: socialAccountPlatformValues }).notNull(),
  externalAccountId: text("external_account_id").notNull(),
  accessTokenRef: text("access_token_ref"),
  // The live long-lived token. Seeded once from INSTAGRAM_ACCESS_TOKEN and
  // then owned by the refresh job, so a rotated token survives restarts and
  // is never overwritten by a stale env value on redeploy.
  accessToken: text("access_token"),
  // Null = unknown (freshly seeded from env); the refresh job resolves it.
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  accessTokenRefreshedAt: timestamp("access_token_refreshed_at", { withTimezone: true }),
  tokenError: text("token_error"),
  status: text("status", { enum: socialAccountStatusValues })
    .notNull()
    .default("active"),
  createdAt: createdAtColumn(),
});
