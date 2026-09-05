import { contentBriefs, contentItems, db as defaultDb, type Db } from "@sma/db";
import { eq } from "drizzle-orm";

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
