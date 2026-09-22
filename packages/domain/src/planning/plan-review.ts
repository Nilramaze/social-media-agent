import { and, eq, inArray } from "drizzle-orm";
import {
  campaigns,
  contentBriefFormatValues,
  contentBriefs,
  contentItems,
  contentPillars,
  db as defaultDb,
  type Db,
} from "@sma/db";
import { z } from "zod";
import { normalizeCampaignFormats } from "../production/campaign-context";

/**
 * The reviewer's version of the plan. Everything is optional per entry:
 * whatever is omitted stays as the strategist planned it.
 */
export const planEditsSchema = z.object({
  pillars: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        // Dropping a pillar cancels every brief planned under it.
        removed: z.boolean().optional(),
      }),
    )
    .default([]),
  briefs: z
    .array(
      z.object({
        id: z.string(),
        topic: z.string().trim().min(1).max(200).optional(),
        format: z.enum(contentBriefFormatValues).optional(),
        removed: z.boolean().optional(),
      }),
    )
    .default([]),
});
export type PlanEdits = z.input<typeof planEditsSchema>;

export class PlanReviewError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "not_in_review" | "empty_plan" | "invalid_edit",
  ) {
    super(message);
    this.name = "PlanReviewError";
  }
}

/**
 * Applies the reviewer's edits to the plan, activates the campaign and
 * creates one content item per remaining brief. Runs in one transaction, so
 * a rejected edit leaves the plan untouched and a double click can't create
 * items twice (the status flip only succeeds once). Returns the new content
 * item ids - the caller enqueues production for them.
 */
export async function approvePlan(
  campaignId: string,
  rawEdits: PlanEdits,
  deps: { db?: Db } = {},
): Promise<{ contentItemIds: string[] }> {
  const db = deps.db ?? defaultDb;
  const edits = planEditsSchema.parse(rawEdits);

  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .update(campaigns)
      .set({ status: "active" })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "plan_review")))
      .returning();
    if (!campaign) {
      const [existing] = await tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      throw existing
        ? new PlanReviewError("Der Plan wartet nicht (mehr) auf Freigabe.", "not_in_review")
        : new PlanReviewError(`Campaign not found: ${campaignId}`, "not_found");
    }

    const pillars = await tx
      .select()
      .from(contentPillars)
      .where(eq(contentPillars.campaignId, campaignId));
    const pillarIds = new Set(pillars.map((p) => p.id));
    const removedPillarIds = new Set<string>();

    for (const edit of edits.pillars) {
      if (!pillarIds.has(edit.id)) {
        throw new PlanReviewError(`Pillar gehoert nicht zu dieser Kampagne: ${edit.id}`, "invalid_edit");
      }
      if (edit.removed) removedPillarIds.add(edit.id);
      await tx
        .update(contentPillars)
        .set({
          ...(edit.name ? { name: edit.name } : {}),
          ...(edit.description ? { description: edit.description } : {}),
          active: !edit.removed,
        })
        .where(eq(contentPillars.id, edit.id));
    }

    const briefs = await tx
      .select()
      .from(contentBriefs)
      .where(eq(contentBriefs.campaignId, campaignId));
    const briefIds = new Set(briefs.map((b) => b.id));
    const allowedFormats = normalizeCampaignFormats(campaign.allowedFormats);

    for (const edit of edits.briefs) {
      if (!briefIds.has(edit.id)) {
        throw new PlanReviewError(`Brief gehoert nicht zu dieser Kampagne: ${edit.id}`, "invalid_edit");
      }
      if (edit.format && !allowedFormats.includes(edit.format)) {
        throw new PlanReviewError(
          `Format "${edit.format}" ist fuer diese Kampagne nicht erlaubt.`,
          "invalid_edit",
        );
      }
      await tx
        .update(contentBriefs)
        .set({
          ...(edit.topic ? { topic: edit.topic } : {}),
          ...(edit.format ? { format: edit.format } : {}),
          ...(edit.removed ? { status: "cancelled" as const } : {}),
        })
        .where(eq(contentBriefs.id, edit.id));
    }

    if (removedPillarIds.size > 0) {
      await tx
        .update(contentBriefs)
        .set({ status: "cancelled" })
        .where(inArray(contentBriefs.pillarId, [...removedPillarIds]));
    }

    const remaining = await tx
      .select()
      .from(contentBriefs)
      .where(and(eq(contentBriefs.campaignId, campaignId), eq(contentBriefs.status, "planned")));
    if (remaining.length === 0) {
      throw new PlanReviewError("Der Plan enthaelt keinen Brief mehr.", "empty_plan");
    }

    const contentItemIds: string[] = [];
    for (const brief of remaining) {
      const [item] = await tx
        .insert(contentItems)
        .values({ workspaceId: brief.workspaceId, briefId: brief.id, format: brief.format })
        .returning({ id: contentItems.id });
      if (item) contentItemIds.push(item.id);
    }
    return { contentItemIds };
  });
}

/**
 * Throws the current plan away so the strategist can plan again (with the
 * reviewer's feedback). Only allowed before approval - once content items
 * exist, pillars and briefs are referenced and stay. Also accepts a failed
 * initial planning, which has no items either.
 */
export async function discardPlan(
  campaignId: string,
  deps: { db?: Db } = {},
): Promise<void> {
  const db = deps.db ?? defaultDb;

  await db.transaction(async (tx) => {
    const [campaign] = await tx
      .update(campaigns)
      .set({ status: "draft", planningError: null })
      .where(
        and(eq(campaigns.id, campaignId), inArray(campaigns.status, ["plan_review", "failed"])),
      )
      .returning({ id: campaigns.id });
    if (!campaign) {
      throw new PlanReviewError(
        "Neu planen geht nur, solange der Plan noch nicht freigegeben ist.",
        "not_in_review",
      );
    }

    await tx.delete(contentBriefs).where(eq(contentBriefs.campaignId, campaignId));
    await tx.delete(contentPillars).where(eq(contentPillars.campaignId, campaignId));
  });
}
