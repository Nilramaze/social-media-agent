import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { campaigns, contentBriefs, contentItems, contentPillars, db, workspaces } from "@sma/db";
import { eq, inArray } from "drizzle-orm";
import { approvePlan, discardPlan, PlanReviewError } from "./plan-review";

async function seedPlan() {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `test-workspace-${randomUUID()}` })
    .returning();
  if (!workspace) throw new Error("failed to create test workspace");

  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId: workspace.id,
      goalText: "Testziel",
      status: "plan_review",
      allowedFormats: ["reel", "post"],
    })
    .returning();
  if (!campaign) throw new Error("failed to create test campaign");

  const [keep, drop] = await db
    .insert(contentPillars)
    .values([
      { workspaceId: workspace.id, campaignId: campaign.id, name: "Wasser", description: "Wasserwerte" },
      { workspaceId: workspace.id, campaignId: campaign.id, name: "Technik", description: "Filtertechnik" },
    ])
    .returning();
  if (!keep || !drop) throw new Error("failed to create pillars");

  const [b1, b2, b3] = await db
    .insert(contentBriefs)
    .values([
      { workspaceId: workspace.id, campaignId: campaign.id, pillarId: keep.id, topic: "pH-Wert", format: "reel" },
      { workspaceId: workspace.id, campaignId: campaign.id, pillarId: keep.id, topic: "Kalk", format: "reel" },
      { workspaceId: workspace.id, campaignId: campaign.id, pillarId: drop.id, topic: "Pumpen", format: "post" },
    ])
    .returning();
  if (!b1 || !b2 || !b3) throw new Error("failed to create briefs");

  return { workspace, campaign, pillars: { keep, drop }, briefs: [b1, b2, b3] as const };
}

async function cleanup(workspaceId: string, campaignId: string) {
  const briefs = await db.select().from(contentBriefs).where(eq(contentBriefs.campaignId, campaignId));
  if (briefs.length > 0) {
    await db.delete(contentItems).where(
      inArray(
        contentItems.briefId,
        briefs.map((b) => b.id),
      ),
    );
  }
  await db.delete(contentBriefs).where(eq(contentBriefs.campaignId, campaignId));
  await db.delete(contentPillars).where(eq(contentPillars.campaignId, campaignId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

test("approvePlan applies edits, activates the campaign and creates items for the remaining briefs", async () => {
  const { workspace, campaign, pillars, briefs } = await seedPlan();
  try {
    const { contentItemIds } = await approvePlan(campaign.id, {
      pillars: [{ id: pillars.keep.id, name: "Wasserqualitaet" }, { id: pillars.drop.id, removed: true }],
      briefs: [
        { id: briefs[0].id, topic: "Der richtige pH-Wert", format: "post" },
        { id: briefs[1].id, removed: true },
      ],
    });

    assert.equal(contentItemIds.length, 1);

    const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    assert.equal(updated?.status, "active");

    const pillarRows = await db.select().from(contentPillars).where(eq(contentPillars.campaignId, campaign.id));
    assert.equal(pillarRows.find((p) => p.id === pillars.keep.id)?.name, "Wasserqualitaet");
    assert.equal(pillarRows.find((p) => p.id === pillars.drop.id)?.active, false);

    const briefRows = await db.select().from(contentBriefs).where(eq(contentBriefs.campaignId, campaign.id));
    const byId = new Map(briefRows.map((b) => [b.id, b]));
    assert.equal(byId.get(briefs[0].id)?.topic, "Der richtige pH-Wert");
    assert.equal(byId.get(briefs[0].id)?.format, "post");
    assert.equal(byId.get(briefs[1].id)?.status, "cancelled");
    // cancelled via its removed pillar
    assert.equal(byId.get(briefs[2].id)?.status, "cancelled");

    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemIds[0]!));
    assert.equal(item?.briefId, briefs[0].id);
    assert.equal(item?.format, "post");

    // A second approval (double click) must not create items again.
    await assert.rejects(approvePlan(campaign.id, {}), (err: unknown) => {
      return err instanceof PlanReviewError && err.code === "not_in_review";
    });
  } finally {
    await cleanup(workspace.id, campaign.id);
  }
});

test("approvePlan rolls back when the edited plan would be empty or uses a disallowed format", async () => {
  const { workspace, campaign, pillars, briefs } = await seedPlan();
  try {
    await assert.rejects(
      approvePlan(campaign.id, {
        pillars: [
          { id: pillars.keep.id, removed: true },
          { id: pillars.drop.id, removed: true },
        ],
      }),
      (err: unknown) => err instanceof PlanReviewError && err.code === "empty_plan",
    );
    await assert.rejects(
      approvePlan(campaign.id, { briefs: [{ id: briefs[0].id, format: "carousel" }] }),
      (err: unknown) => err instanceof PlanReviewError && err.code === "invalid_edit",
    );

    const [unchanged] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    assert.equal(unchanged?.status, "plan_review");
    const briefRows = await db.select().from(contentBriefs).where(eq(contentBriefs.campaignId, campaign.id));
    assert.ok(briefRows.every((b) => b.status === "planned"));
    const pillarRows = await db.select().from(contentPillars).where(eq(contentPillars.campaignId, campaign.id));
    assert.ok(pillarRows.every((p) => p.active));
  } finally {
    await cleanup(workspace.id, campaign.id);
  }
});

test("discardPlan drops pillars and briefs and resets the campaign to draft", async () => {
  const { workspace, campaign } = await seedPlan();
  try {
    await discardPlan(campaign.id);

    const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    assert.equal(updated?.status, "draft");
    assert.equal(
      (await db.select().from(contentBriefs).where(eq(contentBriefs.campaignId, campaign.id))).length,
      0,
    );
    assert.equal(
      (await db.select().from(contentPillars).where(eq(contentPillars.campaignId, campaign.id))).length,
      0,
    );

    // Not in review any more -> refused.
    await assert.rejects(
      discardPlan(campaign.id),
      (err: unknown) => err instanceof PlanReviewError && err.code === "not_in_review",
    );
  } finally {
    await cleanup(workspace.id, campaign.id);
  }
});

after(async () => {
  await db.$client.end();
});
