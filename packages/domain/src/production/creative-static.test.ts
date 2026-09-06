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
import { runCreativeStatic } from "./creative-static";
import { FakeStaticSlideRenderer } from "../testing/fake-static-slide-renderer";

async function seedContentItemWithVersion(format: "carousel" | "post") {
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
    .values({ workspaceId: workspace.id, campaignId: campaign.id, topic: "Email-Automatisierung", format })
    .returning();
  if (!brief) throw new Error("failed");
  const [item] = await db
    .insert(contentItems)
    .values({ workspaceId: workspace.id, briefId: brief.id, format })
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

test("runCreativeStatic renders one slide per carousel and one for post", async () => {
  const { workspace, campaign, brief, item } = await seedContentItemWithVersion("carousel");

  try {
    const storage = new FakeStorageProvider();
    const renderer = new FakeStaticSlideRenderer();
    const llm = new FakeLLMProvider({
      generateStructured: () => ({
        slides: [
          { text: "Volles Postfach", imagePrompt: "a stressed person facing a full inbox" },
          { text: "Aufgeraeumtes Dashboard", imagePrompt: "a clean dashboard with completed tasks" },
          { text: "Jetzt automatisieren", imagePrompt: "a person relaxing while automation runs" },
        ],
      }),
    });
    const image = new FakeImageProvider();

    const { creativeVersionId } = await runCreativeStatic(
      item.id,
      { format: "carousel" },
      { llm, image, storage, renderer },
    );

    assert.equal(renderer.calls.length, 3);
    assert.equal(image.calls.length, 3);
    assert.deepEqual(
      image.calls.map((c) => c.size),
      ["square", "square", "square"],
    );
    assert.equal(storage.uploads.size, 3);

    const [creative] = await db.select().from(creativeVersions).where(eq(creativeVersions.id, creativeVersionId));
    assert.equal(creative?.assetRefs.length, 3);
    assert.equal(creative?.subtitleData, null);

    const [updatedItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updatedItem?.currentCreativeVersionId, creativeVersionId);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("runCreativeStatic renders a single slide for post", async () => {
  const { workspace, campaign, brief, item } = await seedContentItemWithVersion("post");

  try {
    const storage = new FakeStorageProvider();
    const renderer = new FakeStaticSlideRenderer();
    const llm = new FakeLLMProvider({
      generateStructured: () => ({
        slides: [{ text: "Automatisiere dein Postfach", imagePrompt: "a clean dashboard with completed tasks" }],
      }),
    });
    const image = new FakeImageProvider();

    const { creativeVersionId } = await runCreativeStatic(
      item.id,
      { format: "post" },
      { llm, image, storage, renderer },
    );

    assert.equal(renderer.calls.length, 1);

    const [creative] = await db.select().from(creativeVersions).where(eq(creativeVersions.id, creativeVersionId));
    assert.equal(creative?.assetRefs.length, 1);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
