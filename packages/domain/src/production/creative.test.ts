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
  workspaces,
} from "@sma/db";
import { FakeImageProvider, FakeLLMProvider, FakeStorageProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runCreative } from "./creative";
import { FakeVideoRenderer } from "../testing/fake-video-renderer";

async function seedContentItemWithVersion() {
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
      script: "Skript",
      caption: "Caption",
      cta: "CTA",
      hashtags: ["#a", "#b", "#c"],
      createdBy: "llm",
    })
    .returning();
  if (!version) throw new Error("failed");
  await db.update(contentItems).set({ currentContentVersionId: version.id }).where(eq(contentItems.id, item.id));

  return { workspace, campaign, brief, item: { ...item, currentContentVersionId: version.id } };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(creativeVersions).where(eq(creativeVersions.contentItemId, ids.itemId));
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, ids.itemId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runCreative renders via the injected renderer, uploads, and persists a creative version", async () => {
  const { workspace, campaign, brief, item } = await seedContentItemWithVersion();

  try {
    const storage = new FakeStorageProvider();
    const renderer = new FakeVideoRenderer();
    const llm = new FakeLLMProvider({
      generateStructured: () => ({
        scenes: [{ imagePrompt: "a full inbox on a laptop screen" }, { imagePrompt: "a clean dashboard with completed tasks" }],
      }),
    });
    const image = new FakeImageProvider();
    const captions = [
      { text: "Hook Skript", startSeconds: 0, endSeconds: 1 },
      { text: "CTA", startSeconds: 1, endSeconds: 2 },
    ];

    const { creativeVersionId } = await runCreative(
      item.id,
      { audioStorageKey: "voice/fake.mp3", captions, durationSeconds: 2 },
      { llm, image, storage, renderer },
    );

    assert.equal(renderer.calls.length, 1);
    assert.equal(renderer.calls[0]?.captions.length, 2);
    assert.equal(renderer.calls[0]?.scenes.length, 2);
    assert.equal(image.calls.length, 2);
    // one upload per scene image + one for the video
    assert.equal(storage.uploads.size, 3);

    const [creative] = await db.select().from(creativeVersions).where(eq(creativeVersions.id, creativeVersionId));
    // video key + audio key + 2 scene image keys
    assert.equal(creative?.assetRefs.length, 4);
    assert.deepEqual(creative?.subtitleData, captions);

    const [updatedItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updatedItem?.currentCreativeVersionId, creativeVersionId);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
