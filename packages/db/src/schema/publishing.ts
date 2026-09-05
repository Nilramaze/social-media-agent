import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { contentItems } from "./content";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const publishJobStatusValues = [
  "pending",
  "publishing",
  "published",
  "failed",
] as const;

export const publishJobs = pgTable("publish_jobs", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  contentItemId: text("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status", { enum: publishJobStatusValues })
    .notNull()
    .default("pending"),
  externalMediaId: text("external_media_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  error: text("error"),
  createdAt: createdAtColumn(),
});
