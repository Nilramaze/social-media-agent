import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAtColumn, idColumn, workspaceIdColumn } from "./common";

export const assetTypeValues = ["image", "video", "audio", "font"] as const;

export const assets = pgTable("assets", {
  id: idColumn(),
  workspaceId: workspaceIdColumn(),
  type: text("type", { enum: assetTypeValues }).notNull(),
  storageKey: text("storage_key").notNull(),
  url: text("url").notNull(),
  provider: text("provider").notNull(),
  metadata: jsonb("metadata"),
  createdAt: createdAtColumn(),
});
