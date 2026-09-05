import { contentBriefs, contentItems, db as defaultDb, type Db } from "@sma/db";
import type { AnalyticsProvider, LLMProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runAnalyticsCollection } from "./collect";
import { runLearningsSummary } from "./learnings";

export interface RunAnalyticsCycleDeps {
  analytics: AnalyticsProvider;
  llm: LLMProvider;
  db?: Db;
}

export interface RunAnalyticsCycleResult {
  itemsCollected: number;
  campaignsSummarized: number;
}

/**
 * Runs once per cycle (triggered by a repeatable job): collects fresh metrics
 * for every published content item, then re-summarizes learnings for every
 * campaign that has at least one published, measured item. Learnings feed
 * back into future planning (see runPlanning), closing the autonomous loop.
 */
export async function runAnalyticsCycle(
  deps: RunAnalyticsCycleDeps,
): Promise<RunAnalyticsCycleResult> {
  const db = deps.db ?? defaultDb;

  const publishedItems = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.status, "published"));

  let itemsCollected = 0;
  const campaignIds = new Set<string>();

  for (const item of publishedItems) {
    const { collected } = await runAnalyticsCollection(item.id, {
      analytics: deps.analytics,
      db,
    });
    if (collected > 0) itemsCollected++;

    const [brief] = await db
      .select()
      .from(contentBriefs)
      .where(eq(contentBriefs.id, item.briefId))
      .limit(1);
    if (brief) campaignIds.add(brief.campaignId);
  }

  let campaignsSummarized = 0;
  for (const campaignId of campaignIds) {
    const result = await runLearningsSummary(campaignId, { llm: deps.llm, db });
    if (!("skipped" in result)) campaignsSummarized++;
  }

  return { itemsCollected, campaignsSummarized };
}
