import { doublePrecision, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { campaigns } from "./campaign";
import { contentItems } from "./content";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const analyticsMetrics = pgTable("analytics_metrics", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  contentItemId: text("content_item_id")
    .notNull()
    .references(() => contentItems.id),
  platform: text("platform").notNull(),
  metricType: text("metric_type").notNull(),
  value: doublePrecision("value").notNull(),
  collectedAt: timestamp("collected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const learnings = pgTable("learnings", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  campaignId: text("campaign_id").references(() => campaigns.id),
  insightText: text("insight_text").notNull(),
  supportingMetrics: jsonb("supporting_metrics"),
  confidence: doublePrecision("confidence"),
  createdAt: createdAtColumn(),
});
