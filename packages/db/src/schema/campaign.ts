import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const campaignStatusValues = ["draft", "active", "completed"] as const;

export const campaigns = pgTable("campaigns", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  goalText: text("goal_text").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: text("status", { enum: campaignStatusValues })
    .notNull()
    .default("draft"),
  createdAt: createdAtColumn(),
});

export const contentPillars = pgTable("content_pillars", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  campaignId: text("campaign_id").references(() => campaigns.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAtColumn(),
});

export const contentBriefFormatValues = ["reel", "carousel", "post"] as const;
export const contentBriefStatusValues = [
  "planned",
  "in_production",
  "done",
  "cancelled",
] as const;

export const contentBriefs = pgTable("content_briefs", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  pillarId: text("pillar_id").references(() => contentPillars.id),
  topic: text("topic").notNull(),
  format: text("format", { enum: contentBriefFormatValues }).notNull(),
  status: text("status", { enum: contentBriefStatusValues })
    .notNull()
    .default("planned"),
  createdAt: createdAtColumn(),
});
