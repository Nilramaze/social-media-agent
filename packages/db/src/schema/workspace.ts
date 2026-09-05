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
  status: text("status", { enum: socialAccountStatusValues })
    .notNull()
    .default("active"),
  createdAt: createdAtColumn(),
});
