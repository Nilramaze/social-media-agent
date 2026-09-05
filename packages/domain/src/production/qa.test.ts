import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  contentVersions,
  creativeVersions,
  db,
  qaResults,
  workspaces,
} from "@sma/db";
import { FakeLLMProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { QA_RETRY_LIMIT, runQA } from "./qa";
import type { QaJudgeOutput } from "./schema";

async function seedItemWithVersion(overrides: Partial<{ hook: string; script: string; caption: string; qaRetryCount: number }> = {}) {
  const [workspace] = await db.insert(workspaces).values({ name: `test-ws-${randomUUID()}` }).returning();
  if (!workspace) throw new Error("failed");
  await db.insert(brandProfiles).values({
    workspaceId: workspace.id,
    voice: "direkt",
    guidelines: "keine Buzzwords",
    targetAudience: "KMU",
  });
  const [campaign] = await db.insert(campaigns).values({ workspaceId: workspace.id, goalText: "x" }).returning();
  if (!campaign) throw new Error("failed");
  const [brief] = await db
    .insert(contentBriefs)
    .values({ workspaceId: workspace.id, campaignId: campaign.id, topic: "Test", format: "reel" })
    .returning();
  if (!brief) throw new Error("failed");
  const [item] = await db
    .insert(contentItems)
    .values({
      workspaceId: workspace.id,
      briefId: brief.id,
      format: "reel",
      qaRetryCount: overrides.qaRetryCount ?? 0,
    })
    .returning();
  if (!item) throw new Error("failed");
  const [version] = await db
    .insert(contentVersions)
    .values({
      workspaceId: workspace.id,
      contentItemId: item.id,
      versionNumber: 1,
      hook: overrides.hook ?? "Sparst du noch Stunden mit Excel?",
      script: overrides.script ?? "Ein normales Skript ohne Probleme.",
      caption: overrides.caption ?? "Automatisierung fuer KMU.",
      cta: "Jetzt Termin buchen.",
      hashtags: ["#kmu", "#automatisierung", "#ki"],
      createdBy: "llm",
    })
    .returning();
  if (!version) throw new Error("failed");
  await db.update(contentItems).set({ currentContentVersionId: version.id }).where(eq(contentItems.id, item.id));

  return { workspace, campaign, brief, item: { ...item, currentContentVersionId: version.id }, version };
}

async function addCreativeVersion(item: { id: string; workspaceId: string }) {
  const [creative] = await db
    .insert(creativeVersions)
    .values({
      workspaceId: item.workspaceId,
      contentItemId: item.id,
      versionNumber: 1,
      remotionProps: { scenes: [] },
      assetRefs: ["https://fake-storage.test/video.mp4"],
    })
    .returning();
  if (!creative) throw new Error("failed");
  await db.update(contentItems).set({ currentCreativeVersionId: creative.id }).where(eq(contentItems.id, item.id));
  return creative;
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(qaResults).where(eq(qaResults.contentItemId, ids.itemId));
  await db.delete(creativeVersions).where(eq(creativeVersions.contentItemId, ids.itemId));
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, ids.itemId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runQA fails on buzzwords without calling the LLM judge", async () => {
  const { workspace, campaign, brief, item } = await seedItemWithVersion({
    script: "Das ist absolut revolutionaer und bahnbrechend.",
  });

  try {
    let judgeCalled = false;
    const llm = new FakeLLMProvider({
      generateStructured: () => {
        judgeCalled = true;
        throw new Error("should not be called");
      },
    });

    const result = await runQA(item.id, { llm });
    assert.equal(result.verdict, "fail");
    assert.equal(result.category, "script");
    assert.equal(result.needsHumanReview, false);
    assert.equal(judgeCalled, false);

    const [updated] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updated?.qaRetryCount, 1);
    assert.equal(updated?.status, "drafting");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("runQA passes clean content and an existing creative version via the LLM judge", async () => {
  const { workspace, campaign, brief, item } = await seedItemWithVersion();
  await addCreativeVersion(item);

  try {
    const judgeOutput: QaJudgeOutput = { verdict: "pass", feedback: "Sieht gut aus." };
    const llm = new FakeLLMProvider({ generateStructured: () => judgeOutput });

    const result = await runQA(item.id, { llm });
    assert.equal(result.verdict, "pass");
    assert.equal(result.category, null);

    const [updated] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updated?.status, "ready_for_review");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("runQA fails with category visual when no creative version exists yet", async () => {
  const { workspace, campaign, brief, item } = await seedItemWithVersion();

  try {
    const judgeOutput: QaJudgeOutput = { verdict: "pass", feedback: "Sieht gut aus." };
    const llm = new FakeLLMProvider({ generateStructured: () => judgeOutput });

    const result = await runQA(item.id, { llm });
    assert.equal(result.verdict, "fail");
    assert.equal(result.category, "visual");

    const [updated] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updated?.status, "drafting");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("runQA escalates to needs_human_review once the retry limit is exceeded", async () => {
  const { workspace, campaign, brief, item } = await seedItemWithVersion({
    qaRetryCount: QA_RETRY_LIMIT,
    script: "revolutionaer",
  });

  try {
    const llm = new FakeLLMProvider({});
    const result = await runQA(item.id, { llm });
    assert.equal(result.verdict, "fail");
    assert.equal(result.needsHumanReview, true);

    const [updated] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updated?.status, "needs_human_review");
    assert.equal(updated?.qaRetryCount, QA_RETRY_LIMIT + 1);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
