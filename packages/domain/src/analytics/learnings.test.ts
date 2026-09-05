import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  analyticsMetrics,
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  contentVersions,
  db,
  learnings,
  workspaces,
} from "@sma/db";
import { FakeLLMProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runLearningsSummary } from "./learnings";

async function seedPublishedItemWithMetrics() {
  const [workspace] = await db.insert(workspaces).values({ name: `test-ws-${randomUUID()}` }).returning();
  if (!workspace) throw new Error("failed");
  const [campaign] = await db.insert(campaigns).values({ workspaceId: workspace.id, goalText: "Leads gewinnen" }).returning();
  if (!campaign) throw new Error("failed");
  const [brief] = await db
    .insert(contentBriefs)
    .values({ workspaceId: workspace.id, campaignId: campaign.id, topic: "KI-Automatisierung", format: "reel" })
    .returning();
  if (!brief) throw new Error("failed");
  const [item] = await db
    .insert(contentItems)
    .values({ workspaceId: workspace.id, briefId: brief.id, format: "reel", status: "published" })
    .returning();
  if (!item) throw new Error("failed");
  const [version] = await db
    .insert(contentVersions)
    .values({
      workspaceId: workspace.id,
      contentItemId: item.id,
      versionNumber: 1,
      hook: "Verlierst du 5 Stunden pro Woche?",
      script: "...",
      caption: "...",
      cta: "...",
      hashtags: ["#a"],
      createdBy: "llm",
    })
    .returning();
  if (!version) throw new Error("failed");
  await db.update(contentItems).set({ currentContentVersionId: version.id }).where(eq(contentItems.id, item.id));
  await db.insert(analyticsMetrics).values([
    { workspaceId: workspace.id, contentItemId: item.id, platform: "instagram", metricType: "views", value: 5000 },
    { workspaceId: workspace.id, contentItemId: item.id, platform: "instagram", metricType: "likes", value: 300 },
  ]);

  return { workspace, campaign, brief, item };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(learnings).where(eq(learnings.campaignId, ids.campaignId));
  await db.delete(analyticsMetrics).where(eq(analyticsMetrics.contentItemId, ids.itemId));
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, ids.itemId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runLearningsSummary builds a prompt from performance data and persists the insight", async () => {
  const { workspace, campaign, brief, item } = await seedPublishedItemWithMetrics();

  try {
    let seenPrompt = "";
    const llm = new FakeLLMProvider({
      generateStructured: (input) => {
        seenPrompt = input.prompt;
        return { insightText: "Konkrete Zahlen im Hook performen besser.", confidence: 0.7 };
      },
    });

    const result = await runLearningsSummary(campaign.id, { llm });
    assert.ok(!("skipped" in result));

    assert.ok(seenPrompt.includes("Verlierst du 5 Stunden pro Woche?"));
    assert.ok(seenPrompt.includes("KI-Automatisierung"));

    const rows = await db.select().from(learnings).where(eq(learnings.campaignId, campaign.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.insightText, "Konkrete Zahlen im Hook performen besser.");
    assert.equal(rows[0]?.confidence, 0.7);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("runLearningsSummary skips campaigns with no measured published content", async () => {
  const [workspace] = await db.insert(workspaces).values({ name: `test-ws-${randomUUID()}` }).returning();
  if (!workspace) throw new Error("failed");
  const [campaign] = await db.insert(campaigns).values({ workspaceId: workspace.id, goalText: "x" }).returning();
  if (!campaign) throw new Error("failed");

  try {
    const llm = new FakeLLMProvider({});
    const result = await runLearningsSummary(campaign.id, { llm });
    assert.deepEqual(result, { skipped: true });
  } finally {
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
  }
});

after(async () => {
  await db.$client.end();
});
