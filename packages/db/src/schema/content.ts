import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { contentBriefs } from "./campaign";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const contentItemFormatValues = ["reel", "carousel", "post"] as const;
export const contentItemStatusValues = [
  "researching",
  "drafting",
  "in_qa",
  "needs_human_review",
  "ready_for_review",
  "approved",
  "changes_requested",
  "rejected",
  "scheduled",
  "published",
  "failed",
] as const;

export const contentItems = pgTable("content_items", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  briefId: text("brief_id")
    .notNull()
    .references(() => contentBriefs.id),
  format: text("format", { enum: contentItemFormatValues }).notNull(),
  status: text("status", { enum: contentItemStatusValues })
    .notNull()
    .default("researching"),
  currentContentVersionId: text("current_content_version_id"),
  currentCreativeVersionId: text("current_creative_version_id"),
  qaRetryCount: integer("qa_retry_count").notNull().default(0),
  createdAt: createdAtColumn(),
});

export const contentVersionCreatedByValues = ["llm", "human"] as const;

export const contentVersions = pgTable("content_versions", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  contentItemId: text("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  versionNumber: integer("version_number").notNull(),
  hook: text("hook").notNull(),
  script: text("script").notNull(),
  caption: text("caption").notNull(),
  cta: text("cta").notNull(),
  hashtags: jsonb("hashtags").notNull().$type<string[]>(),
  createdBy: text("created_by", { enum: contentVersionCreatedByValues })
    .notNull()
    .default("llm"),
  revisionFeedback: text("revision_feedback"),
  createdAt: createdAtColumn(),
});

export const creativeVersions = pgTable("creative_versions", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  contentItemId: text("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  versionNumber: integer("version_number").notNull(),
  remotionProps: jsonb("remotion_props").notNull(),
  assetRefs: jsonb("asset_refs").notNull().$type<string[]>(),
  subtitleData: jsonb("subtitle_data"),
  createdAt: createdAtColumn(),
});
