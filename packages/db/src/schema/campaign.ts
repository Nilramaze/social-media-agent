import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const campaignStatusValues = ["draft", "active", "completed", "failed"] as const;

export const contentBriefFormatValues = ["reel", "carousel", "post"] as const;
export type ContentBriefFormat = (typeof contentBriefFormatValues)[number];

export const campaigns = pgTable("campaigns", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  goalText: text("goal_text").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: text("status", { enum: campaignStatusValues })
    .notNull()
    .default("draft"),
  planningError: text("planning_error"),
  // Uploaded design.md content (visual brand guidelines: colors, style,
  // logo rules, etc.) - fed into the image-generation prompts so scene/slide
  // visuals stay on-brand across the campaign's content items.
  designGuidelines: text("design_guidelines"),
  // Guardrails. `goalText` above is the campaign's original prompt and stays
  // untouched for the campaign's whole life - it is the single source of truth
  // for topic, industry, product and audience, and every downstream agent
  // (strategist, research, content, visual director, QA) gets it verbatim.
  // `extraInstructions` is where follow-up direction lands ("mehr zu
  // Wasserwerten, weniger Technik") without rewriting the original prompt.
  extraInstructions: text("extra_instructions"),
  // Terms that must never appear in this campaign's copy. Checked
  // deterministically in QA next to the buzzword blocklist - that is what
  // catches topic bleed from other campaigns ("KI", "Webagentur", ...) even
  // when the LLM judge waves it through.
  bannedTerms: jsonb("banned_terms").notNull().default([]).$type<string[]>(),
  // Which content formats this campaign may produce. The strategist's output
  // schema is built from this list, so a deselected format is structurally
  // unavailable rather than merely discouraged. Never empty - see
  // normalizeCampaignFormats.
  allowedFormats: jsonb("allowed_formats")
    .notNull()
    .default([...contentBriefFormatValues])
    .$type<ContentBriefFormat[]>(),
  // Auto-replenish: when enabled, the worker periodically counts how many
  // content items are still ahead of publication (in production, in review
  // or scheduled). With one post/day that count equals the days of coverage.
  // Once it drops below `autoReplenishBufferDays`, the strategist plans the
  // missing briefs against the campaign's existing pillars.
  autoReplenish: boolean("auto_replenish").notNull().default(false),
  autoReplenishBufferDays: integer("auto_replenish_buffer_days").notNull().default(7),
  lastReplenishedAt: timestamp("last_replenished_at", { withTimezone: true }),
  replenishError: text("replenish_error"),
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
