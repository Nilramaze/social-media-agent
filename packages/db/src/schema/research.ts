import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { contentBriefs } from "./campaign";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const researchFindings = pgTable("research_findings", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  briefId: text("brief_id")
    .notNull()
    .references(() => contentBriefs.id),
  topic: text("topic").notNull(),
  summary: text("summary").notNull(),
  sources: jsonb("sources").notNull().$type<{ title: string; url: string }[]>(),
  createdAt: createdAtColumn(),
});
