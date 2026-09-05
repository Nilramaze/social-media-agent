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
  workspaces,
} from "@sma/db";
import { FakeStorageProvider, FakeVoiceProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runVoice } from "./voice";

async function seedContentItemWithVersion(script: string) {
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
  const [version] = await db
    .insert(contentVersions)
    .values({
      workspaceId: workspace.id,
      contentItemId: item.id,
      versionNumber: 1,
      hook: "Hook",
      script,
      caption: "Caption",
      cta: "CTA",
      hashtags: ["#a", "#b", "#c"],
      createdBy: "llm",
    })
    .returning();
  if (!version) throw new Error("failed");
  await db.update(contentItems).set({ currentContentVersionId: version.id }).where(eq(contentItems.id, item.id));

  return { workspace, campaign, brief, item };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, ids.itemId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runVoice synthesizes the script, uploads the audio, and groups words into captions", async () => {
  const { workspace, campaign, brief, item } = await seedContentItemWithVersion(
    "Eins zwei drei vier fuenf sechs sieben acht neun zehn elf zwoelf",
  );

  try {
    const voice = new FakeVoiceProvider();
    const storage = new FakeStorageProvider();

    const result = await runVoice(item.id, { voice, storage });

    assert.equal(voice.calls.length, 1);
    assert.equal(storage.uploads.size, 1);
    assert.ok(result.audioStorageKey.startsWith(`voice/${item.id}/`));
    // 12 words grouped into chunks of 5 -> 3 captions (5, 5, 2)
    assert.equal(result.captions.length, 3);
    assert.equal(result.captions[0]?.text, "Eins zwei drei vier fuenf");
    assert.equal(result.captions[2]?.text, "elf zwoelf");
    assert.ok(result.durationSeconds > 0);
    assert.equal(result.captions[2]?.endSeconds, result.durationSeconds);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
