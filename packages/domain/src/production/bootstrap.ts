import { contentBriefs, contentItems, db as defaultDb, type Db } from "@sma/db";
import { eq, inArray } from "drizzle-orm";

export async function createContentItemsForCampaign(
  campaignId: string,
  deps: { db?: Db } = {},
): Promise<string[]> {
  const db = deps.db ?? defaultDb;

  const briefs = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.campaignId, campaignId));

  const ids: string[] = [];
  for (const brief of briefs) {
    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId: brief.workspaceId,
        briefId: brief.id,
        format: brief.format,
      })
      .returning();
    if (item) ids.push(item.id);
  }
  return ids;
}

/**
 * Creates one content item per given brief - used by replenish runs, where
 * only the newly planned briefs need items (the campaign's older briefs
 * already have theirs).
 */
export async function createContentItemsForBriefs(
  briefIds: string[],
  deps: { db?: Db } = {},
): Promise<string[]> {
  const db = deps.db ?? defaultDb;
  if (briefIds.length === 0) return [];

  const briefs = await db
    .select()
    .from(contentBriefs)
    .where(inArray(contentBriefs.id, briefIds));

  const ids: string[] = [];
  for (const brief of briefs) {
    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId: brief.workspaceId,
        briefId: brief.id,
        format: brief.format,
      })
      .returning();
    if (item) ids.push(item.id);
  }
  return ids;
}
