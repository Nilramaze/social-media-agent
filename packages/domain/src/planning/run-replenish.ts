import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import {
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  contentPillars,
  db as defaultDb,
  learnings,
  type Db,
} from "@sma/db";
import type { LLMProvider } from "@sma/providers";
import { NODE_MODELS } from "../model-config";
import { buildReplenishPrompt, STRATEGIST_SYSTEM_PROMPT } from "./prompt";
import { MAX_REPLENISH_COUNT, replenishOutputSchema } from "./schema";

export interface RunReplenishDeps {
  llm: LLMProvider;
  db?: Db;
}

export interface RunReplenishResult {
  briefIds: string[];
}

/**
 * Adds `count` new briefs to an already-planned campaign. Unlike the initial
 * runPlanning, the pillars stay as they are; the strategist sees every topic
 * the campaign already covers plus the latest learnings, and only returns
 * new briefs. Content items are NOT created here - see
 * createContentItemsForBriefs, so the caller can enqueue production per item.
 */
export async function runReplenishPlanning(
  campaignId: string,
  count: number,
  deps: RunReplenishDeps,
): Promise<RunReplenishResult> {
  const db = deps.db ?? defaultDb;
  const target = Math.min(Math.max(Math.floor(count), 1), MAX_REPLENISH_COUNT);

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const [brandProfile] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.workspaceId, campaign.workspaceId))
    .limit(1);
  if (!brandProfile) {
    throw new Error(`No brand profile for workspace: ${campaign.workspaceId}`);
  }

  const pillars = await db
    .select()
    .from(contentPillars)
    .where(and(eq(contentPillars.campaignId, campaignId), eq(contentPillars.active, true)));
  if (pillars.length === 0) {
    throw new Error(
      `Campaign has no active pillars yet - initial planning must finish first: ${campaignId}`,
    );
  }

  const existingBriefs = await db
    .select({ topic: contentBriefs.topic })
    .from(contentBriefs)
    .where(eq(contentBriefs.campaignId, campaignId));

  const recentLearnings = await db
    .select()
    .from(learnings)
    .where(eq(learnings.workspaceId, campaign.workspaceId))
    .orderBy(desc(learnings.createdAt))
    .limit(10);

  const prompt = buildReplenishPrompt({
    goalText: campaign.goalText,
    brandProfile,
    recentLearnings,
    pillars,
    existingTopics: existingBriefs.map((b) => b.topic),
    count: target,
  });

  const output = await deps.llm.generateStructured({
    schema: replenishOutputSchema,
    system: STRATEGIST_SYSTEM_PROMPT,
    prompt,
    model: NODE_MODELS.strategist,
  });

  const pillarNameToId = new Map(pillars.map((p) => [p.name, p.id]));
  const knownTopics = new Set(existingBriefs.map((b) => b.topic.trim().toLowerCase()));

  const briefIds: string[] = [];
  for (const brief of output.briefs) {
    // Cap after filtering, so a duplicate or an unknown pillar doesn't eat
    // one of the requested slots.
    if (briefIds.length >= target) break;
    const pillarId = pillarNameToId.get(brief.pillarName);
    // The prompt pins pillarName to the existing set; a hallucinated name
    // gets dropped instead of creating an orphan brief.
    if (!pillarId) continue;
    const key = brief.topic.trim().toLowerCase();
    if (knownTopics.has(key)) continue;
    knownTopics.add(key);

    const [inserted] = await db
      .insert(contentBriefs)
      .values({
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        pillarId,
        topic: brief.topic,
        format: brief.format,
      })
      .returning({ id: contentBriefs.id });
    if (inserted) briefIds.push(inserted.id);
  }

  if (briefIds.length === 0) {
    throw new Error(
      "Strategist returned no usable new briefs (all duplicates or unknown pillars)",
    );
  }

  await db
    .update(campaigns)
    .set({ lastReplenishedAt: new Date(), replenishError: null })
    .where(eq(campaigns.id, campaign.id));

  return { briefIds };
}

/** Statuses that no longer count towards upcoming coverage. */
const TERMINAL_ITEM_STATUSES = ["published", "rejected", "failed"] as const;

/**
 * Number of content items still ahead of publication for a campaign
 * (anything not published/rejected/failed). With one post per day this is
 * the number of days the campaign is covered for.
 */
export async function countUpcomingContentItems(
  campaignId: string,
  deps: { db?: Db } = {},
): Promise<number> {
  const db = deps.db ?? defaultDb;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .where(
      and(
        eq(contentBriefs.campaignId, campaignId),
        notInArray(contentItems.status, [...TERMINAL_ITEM_STATUSES]),
      ),
    );
  return row?.count ?? 0;
}

export interface ReplenishCandidate {
  campaignId: string;
  upcoming: number;
  bufferDays: number;
  /** How many briefs to plan to get back up to the buffer. */
  count: number;
}

/**
 * Finds every active campaign with auto-replenish on whose upcoming coverage
 * has dropped below its buffer, and how many briefs each one needs. Pure
 * read - the caller decides whether to enqueue (and dedupes against jobs
 * already in flight).
 */
export async function findCampaignsToReplenish(
  deps: { db?: Db } = {},
): Promise<ReplenishCandidate[]> {
  const db = deps.db ?? defaultDb;
  const candidates = await db
    .select({
      id: campaigns.id,
      bufferDays: campaigns.autoReplenishBufferDays,
    })
    .from(campaigns)
    .where(and(eq(campaigns.autoReplenish, true), eq(campaigns.status, "active")));

  const result: ReplenishCandidate[] = [];
  for (const c of candidates) {
    const upcoming = await countUpcomingContentItems(c.id, { db });
    if (upcoming >= c.bufferDays) continue;
    result.push({
      campaignId: c.id,
      upcoming,
      bufferDays: c.bufferDays,
      count: Math.min(c.bufferDays - upcoming, MAX_REPLENISH_COUNT),
    });
  }
  return result;
}
