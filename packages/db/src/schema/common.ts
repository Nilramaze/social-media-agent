import { randomUUID } from "node:crypto";
import { text, timestamp } from "drizzle-orm/pg-core";

export const idColumn = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

export const workspaceIdColumn = () => text("workspace_id").notNull();

export const createdAtColumn = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
