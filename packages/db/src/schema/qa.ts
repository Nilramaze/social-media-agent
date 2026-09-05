import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { contentItems, contentVersions, creativeVersions } from "./content";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const qaVerdictValues = ["pass", "fail"] as const;
export const qaCategoryValues = ["script", "visual", "both"] as const;

export const qaResults = pgTable("qa_results", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  contentItemId: text("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  contentVersionId: text("content_version_id").references(
    () => contentVersions.id,
  ),
  creativeVersionId: text("creative_version_id").references(
    () => creativeVersions.id,
  ),
  verdict: text("verdict", { enum: qaVerdictValues }).notNull(),
  category: text("category", { enum: qaCategoryValues }),
  schemaErrors: jsonb("schema_errors"),
  judgeFeedback: text("judge_feedback"),
  createdAt: createdAtColumn(),
});
