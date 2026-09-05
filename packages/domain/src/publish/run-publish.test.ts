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
  publishJobs,
  workspaces,
} from "@sma/db";
import { FakeStorageProvider, MockPublishProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runPublish } from "./run-publish";

async function seedApprovedItem() {
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
    .values({ workspaceId: workspace.id, briefId: brief.id, format: "reel", status: "approved" })
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
      caption: "Automatisierung fuer KMU.",
      cta: "Jetzt buchen.",
      hashtags: ["#kmu", "#ki"],
      createdBy: "llm",
    })
    .returning();
  if (!version) throw new Error("failed");
  const [creative] = await db
    .insert(creativeVersions)
    .values({
      workspaceId: workspace.id,
      contentItemId: item.id,
      versionNumber: 1,
      remotionProps: {},
      assetRefs: ["creative/fake.mp4"],
    })
    .returning();
  if (!creative) throw new Error("failed");
  await db
    .update(contentItems)
    .set({ currentContentVersionId: version.id, currentCreativeVersionId: creative.id })
    .where(eq(contentItems.id, item.id));

  return { workspace, campaign, brief, item };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(publishJobs).where(eq(publishJobs.contentItemId, ids.itemId));
  await db.delete(creativeVersions).where(eq(creativeVersions.contentItemId, ids.itemId));
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, ids.itemId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runPublish polls until the container finishes, publishes, and marks the item published", async () => {
  const { workspace, campaign, brief, item } = await seedApprovedItem();

  try {
    const publish = new MockPublishProvider();
    const storage = new FakeStorageProvider();

    const result = await runPublish(item.id, {
      publish,
      storage,
      pollIntervalMs: 50,
      maxPollAttempts: 100,
    });

    assert.equal(result.skipped, false);
    assert.ok(result.externalMediaId.startsWith("mock_media_"));

    const [job] = await db.select().from(publishJobs).where(eq(publishJobs.contentItemId, item.id));
    assert.equal(job?.status, "published");
    assert.equal(job?.externalMediaId, result.externalMediaId);

    const [updatedItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updatedItem?.status, "published");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("runPublish is idempotent when called again for an already-published item", async () => {
  const { workspace, campaign, brief, item } = await seedApprovedItem();

  try {
    const publish = new MockPublishProvider();
    const storage = new FakeStorageProvider();
    const deps = { publish, storage, pollIntervalMs: 50, maxPollAttempts: 100 };

    const first = await runPublish(item.id, deps);
    const second = await runPublish(item.id, deps);

    assert.equal(second.skipped, true);
    assert.equal(second.externalMediaId, first.externalMediaId);

    const jobs = await db.select().from(publishJobs).where(eq(publishJobs.contentItemId, item.id));
    assert.equal(jobs.length, 1);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
