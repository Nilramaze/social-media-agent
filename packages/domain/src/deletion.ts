import {
  analyticsMetrics,
  approvals,
  campaigns,
  contentBriefs,
  contentItems,
  contentPillars,
  contentVersions,
  creativeVersions,
  db as defaultDb,
  publishJobs,
  qaResults,
  researchFindings,
  type Db,
} from "@sma/db";
import { eq, sql } from "drizzle-orm";

export interface DeleteDeps {
  db?: Db;
}

// LangGraph's Postgres checkpointer owns these tables (created by
// @langchain/langgraph-checkpoint-postgres) - they aren't part of the
// Drizzle schema, so raw SQL is the only way to clean them up. A
// content_item's id doubles as its graph thread_id.
async function deleteCheckpointsForThread(db: Db, threadId: string): Promise<void> {
  await db.execute(sql`delete from checkpoint_writes where thread_id = ${threadId}`);
  await db.execute(sql`delete from checkpoint_blobs where thread_id = ${threadId}`);
  await db.execute(sql`delete from checkpoints where thread_id = ${threadId}`);
}

export async function deleteContentItem(
  contentItemId: string,
  deps: DeleteDeps = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;

  await deleteCheckpointsForThread(db, contentItemId);
  await db.delete(analyticsMetrics).where(eq(analyticsMetrics.contentItemId, contentItemId));
  await db.delete(publishJobs).where(eq(publishJobs.contentItemId, contentItemId));
  await db.delete(approvals).where(eq(approvals.contentItemId, contentItemId));
  await db.delete(qaResults).where(eq(qaResults.contentItemId, contentItemId));
  await db.delete(creativeVersions).where(eq(creativeVersions.contentItemId, contentItemId));
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, contentItemId));
  await db.delete(contentItems).where(eq(contentItems.id, contentItemId));
}

export async function deleteCampaign(
  campaignId: string,
  deps: DeleteDeps = {},
): Promise<{ deletedContentItems: number }> {
  const db = deps.db ?? defaultDb;

  const briefs = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.campaignId, campaignId));

  let deletedContentItems = 0;
  for (const brief of briefs) {
    const items = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.briefId, brief.id));
    for (const item of items) {
      await deleteContentItem(item.id, { db });
      deletedContentItems++;
    }
    await db.delete(researchFindings).where(eq(researchFindings.briefId, brief.id));
  }

  await db.delete(contentBriefs).where(eq(contentBriefs.campaignId, campaignId));
  await db.delete(contentPillars).where(eq(contentPillars.campaignId, campaignId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));

  return { deletedContentItems };
}
