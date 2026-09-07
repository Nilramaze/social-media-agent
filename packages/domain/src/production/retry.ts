import { contentItems, db as defaultDb, type Db } from "@sma/db";
import { eq } from "drizzle-orm";

/**
 * Clears a failed item's error state so it can be re-enqueued. Only resets
 * the DB row - the caller is responsible for actually re-queuing the
 * production job (kept separate so this stays queue-agnostic, matching the
 * rest of @sma/domain).
 */
export async function retryContentItem(
  contentItemId: string,
  deps: { db?: Db } = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);
  if (item.status !== "failed") {
    throw new Error(`Content item is not in a failed state (status: ${item.status})`);
  }

  await db
    .update(contentItems)
    .set({ status: "drafting", lastError: null })
    .where(eq(contentItems.id, contentItemId));
}

export async function listFailedContentItemIds(deps: { db?: Db } = {}): Promise<string[]> {
  const db = deps.db ?? defaultDb;
  const rows = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(eq(contentItems.status, "failed"));
  return rows.map((r) => r.id);
}
