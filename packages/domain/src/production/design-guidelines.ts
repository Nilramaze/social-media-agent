import { campaigns, contentBriefs, db as defaultDb, type Db } from "@sma/db";
import { eq } from "drizzle-orm";

/** The campaign's uploaded design.md content, if any - null if the brief/campaign has none set. */
export async function getDesignGuidelines(
  briefId: string,
  deps: { db?: Db } = {},
): Promise<string | null> {
  const db = deps.db ?? defaultDb;

  const [brief] = await db.select().from(contentBriefs).where(eq(contentBriefs.id, briefId)).limit(1);
  if (!brief) return null;

  const [campaign] = await db
    .select({ designGuidelines: campaigns.designGuidelines })
    .from(campaigns)
    .where(eq(campaigns.id, brief.campaignId))
    .limit(1);

  return campaign?.designGuidelines ?? null;
}
