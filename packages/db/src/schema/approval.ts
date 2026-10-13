import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { contentItems } from "./content";
import { idColumn, workspaceIdColumn } from "./common";

export const approvalDecisionValues = [
  "approved",
  "changes_requested",
  "rejected",
] as const;
export const approvalTargetValues = ["content", "creative"] as const;
// "script": the text gate between content and the expensive voice/image/
// render steps. "final": the review of the finished, QA-passed media.
export const approvalStageValues = ["script", "final"] as const;

export const approvals = pgTable("approvals", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  contentItemId: text("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  decision: text("decision", { enum: approvalDecisionValues }).notNull(),
  stage: text("stage", { enum: approvalStageValues }).notNull().default("final"),
  target: text("target", { enum: approvalTargetValues }),
  feedback: text("feedback"),
  decidedBy: text("decided_by").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
