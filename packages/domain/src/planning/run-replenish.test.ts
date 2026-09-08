import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  contentPillars,
  db,
  workspaces,
} from "@sma/db";
import { FakeLLMProvider } from "@sma/providers";
import { eq, inArray } from "drizzle-orm";
import { createContentItemsForBriefs } from "../production/bootstrap";
import {
  countUpcomingContentItems,
  findCampaignsToReplenish,
  runReplenishPlanning,
} from "./run-replenish";
import type { ReplenishOutput } from "./schema";

async function seedPlannedCampaign(opts: { autoReplenish?: boolean; bufferDays?: number } = {}) {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `test-workspace-${randomUUID()}` })
    .returning();
  if (!workspace) throw new Error("failed to create test workspace");

  await db.insert(brandProfiles).values({
    workspaceId: workspace.id,
    voice: "direkt und klar",
    guidelines: "keine Buzzwords",
    targetAudience: "kleine Unternehmen",
  });

  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId: workspace.id,
      goalText: "Testziel",
      status: "active",
      autoReplenish: opts.autoReplenish ?? false,
      autoReplenishBufferDays: opts.bufferDays ?? 7,
    })
    .returning();
  if (!campaign) throw new Error("failed to create test campaign");

  const [pillar] = await db
    .insert(contentPillars)
    .values({
      workspaceId: workspace.id,
      campaignId: campaign.id,
      name: "Automatisierung",
      description: "KI-Automatisierung fuer KMU",
    })
    .returning();
  if (!pillar) throw new Error("failed to create pillar");

  const [brief] = await db
    .insert(contentBriefs)
    .values({
      workspaceId: workspace.id,
      campaignId: campaign.id,
      pillarId: pillar.id,
      topic: "Bestehendes Thema",
      format: "reel",
    })
    .returning();
  if (!brief) throw new Error("failed to create brief");

  return { workspace, campaign, pillar, brief };
}

async function cleanup(workspaceId: string, campaignId: string) {
  const briefs = await db
    .select({ id: contentBriefs.id })
    .from(contentBriefs)
    .where(eq(contentBriefs.campaignId, campaignId));
  if (briefs.length > 0) {
    await db.delete(contentItems).where(inArray(contentItems.briefId, briefs.map((b) => b.id)));
  }
  await db.delete(contentBriefs).where(eq(contentBriefs.campaignId, campaignId));
  await db.delete(contentPillars).where(eq(contentPillars.campaignId, campaignId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

test("runReplenishPlanning adds new briefs to existing pillars and skips duplicates/unknown pillars", async () => {
  const { workspace, campaign, pillar } = await seedPlannedCampaign();

  try {
    let seenPrompt = "";
    const fakeOutput: ReplenishOutput = {
      briefs: [
        { topic: "Neues Thema A", format: "carousel", pillarName: "Automatisierung" },
        { topic: "bestehendes thema", format: "post", pillarName: "Automatisierung" }, // duplicate
        { topic: "Neues Thema B", format: "reel", pillarName: "Gibt es nicht" }, // unknown pillar
        { topic: "Neues Thema C", format: "post", pillarName: "Automatisierung" },
      ],
    };

    const { briefIds } = await runReplenishPlanning(campaign.id, 3, {
      llm: new FakeLLMProvider({
        generateStructured: (input) => {
          seenPrompt = input.prompt;
          return fakeOutput;
        },
      }),
    });

    assert.equal(briefIds.length, 2);
    assert.match(seenPrompt, /Bestehendes Thema/);
    assert.match(seenPrompt, /genau 3 NEUE/);

    const pillars = await db
      .select()
      .from(contentPillars)
      .where(eq(contentPillars.campaignId, campaign.id));
    assert.equal(pillars.length, 1, "replenish must not add pillars");

    const briefs = await db
      .select()
      .from(contentBriefs)
      .where(eq(contentBriefs.campaignId, campaign.id));
    assert.equal(briefs.length, 3);
    assert.ok(briefs.every((b) => b.pillarId === pillar.id));

    const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    assert.ok(updated?.lastReplenishedAt);
    assert.equal(updated?.replenishError, null);

    const itemIds = await createContentItemsForBriefs(briefIds);
    assert.equal(itemIds.length, 2);
    assert.equal(await countUpcomingContentItems(campaign.id), 2);
  } finally {
    await cleanup(workspace.id, campaign.id);
  }
});

test("findCampaignsToReplenish only returns auto campaigns below their buffer", async () => {
  const low = await seedPlannedCampaign({ autoReplenish: true, bufferDays: 3 });
  const full = await seedPlannedCampaign({ autoReplenish: true, bufferDays: 1 });
  const manual = await seedPlannedCampaign({ autoReplenish: false, bufferDays: 7 });

  try {
    // `low` has 1 upcoming item vs buffer 3; `full` has 1 vs buffer 1;
    // a published item must not count towards coverage.
    await createContentItemsForBriefs([low.brief.id]);
    await createContentItemsForBriefs([full.brief.id]);
    const [manualItemId] = await createContentItemsForBriefs([manual.brief.id]);
    await db
      .update(contentItems)
      .set({ status: "published" })
      .where(eq(contentItems.id, manualItemId!));

    const candidates = await findCampaignsToReplenish();
    const byId = new Map(candidates.map((c) => [c.campaignId, c]));

    assert.deepEqual(byId.get(low.campaign.id), {
      campaignId: low.campaign.id,
      upcoming: 1,
      bufferDays: 3,
      count: 2,
    });
    assert.equal(byId.has(full.campaign.id), false);
    assert.equal(byId.has(manual.campaign.id), false);
    assert.equal(await countUpcomingContentItems(manual.campaign.id), 0);
  } finally {
    await cleanup(low.workspace.id, low.campaign.id);
    await cleanup(full.workspace.id, full.campaign.id);
    await cleanup(manual.workspace.id, manual.campaign.id);
  }
});

after(async () => {
  await db.$client.end();
});
