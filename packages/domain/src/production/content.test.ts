import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  contentVersions,
  db,
  qaResults,
  researchFindings,
  workspaces,
} from "@sma/db";
import { FakeLLMProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runContent } from "./content";
import type { ContentOutput } from "./schema";

async function seedContentItemWithResearch() {
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
    .values({ workspaceId: workspace.id, campaignId: campaign.id, topic: "KI-Automatisierung", format: "reel" })
    .returning();
  if (!brief) throw new Error("failed");
  const [item] = await db
    .insert(contentItems)
    .values({ workspaceId: workspace.id, briefId: brief.id, format: "reel" })
    .returning();
  if (!item) throw new Error("failed");
  await db.insert(researchFindings).values({
    workspaceId: workspace.id,
    briefId: brief.id,
    topic: brief.topic,
    summary: "Testzusammenfassung",
    sources: [{ title: "Quelle", url: "https://example.com" }],
  });
  return { workspace, campaign, brief, item };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(qaResults).where(eq(qaResults.contentItemId, ids.itemId));
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, ids.itemId));
  await db.delete(researchFindings).where(eq(researchFindings.briefId, ids.briefId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runContent persists a content version and marks the item script_review", async () => {
  const { workspace, campaign, brief, item } = await seedContentItemWithResearch();

  try {
    const fakeOutput: ContentOutput = {
      hook: "Sparst du noch Stunden mit Excel?",
      script: "...",
      caption: "Automatisierung fuer KMU.",
      cta: "Jetzt Termin buchen.",
      hashtags: ["#kiautomatisierung", "#kmu", "#automatisierung"],
    };

    const llm = new FakeLLMProvider({ generateStructured: () => fakeOutput });
    const { contentVersionId } = await runContent(item.id, { llm });

    const [version] = await db.select().from(contentVersions).where(eq(contentVersions.id, contentVersionId));
    assert.equal(version?.hook, fakeOutput.hook);
    assert.equal(version?.versionNumber, 1);

    const [updatedItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updatedItem?.status, "script_review");
    assert.equal(updatedItem?.currentContentVersionId, contentVersionId);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("runContent incorporates QA feedback and bumps the version number on revision", async () => {
  const { workspace, campaign, brief, item } = await seedContentItemWithResearch();

  try {
    const firstOutput: ContentOutput = {
      hook: "Schwacher Hook",
      script: "...",
      caption: "...",
      cta: "...",
      hashtags: ["#a", "#b", "#c"],
    };
    const llmFirst = new FakeLLMProvider({ generateStructured: () => firstOutput });
    const { contentVersionId: firstVersionId } = await runContent(item.id, { llm: llmFirst });

    await db.insert(qaResults).values({
      workspaceId: workspace.id,
      contentItemId: item.id,
      contentVersionId: firstVersionId,
      verdict: "fail",
      category: "script",
      judgeFeedback: "Der Hook ist zu generisch, konkreter formulieren.",
    });

    let seenPrompt = "";
    const secondOutput: ContentOutput = {
      hook: "Verlierst du 5 Stunden pro Woche an Buchhaltung?",
      script: "...",
      caption: "...",
      cta: "...",
      hashtags: ["#a", "#b", "#c"],
    };
    const llmSecond = new FakeLLMProvider({
      generateStructured: (input) => {
        seenPrompt = input.prompt;
        return secondOutput;
      },
    });
    const { contentVersionId: secondVersionId } = await runContent(item.id, { llm: llmSecond });

    assert.ok(seenPrompt.includes("Der Hook ist zu generisch"));

    const [secondVersion] = await db.select().from(contentVersions).where(eq(contentVersions.id, secondVersionId));
    assert.equal(secondVersion?.versionNumber, 2);
    assert.equal(secondVersion?.revisionFeedback, "Der Hook ist zu generisch, konkreter formulieren.");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
