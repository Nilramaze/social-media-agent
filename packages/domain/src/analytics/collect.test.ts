import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  analyticsMetrics,
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  db,
  publishJobs,
  workspaces,
} from "@sma/db";
import { MockAnalyticsProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runAnalyticsCollection } from "./collect";

async function seedPublishedItem() {
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
    .values({ workspaceId: workspace.id, briefId: brief.id, format: "reel", status: "published" })
    .returning();
  if (!item) throw new Error("failed");
  await db.insert(publishJobs).values({
    workspaceId: workspace.id,
    contentItemId: item.id,
    scheduledAt: new Date(),
    idempotencyKey: `publish-${item.id}`,
    status: "published",
    externalMediaId: "mock_media_test",
    publishedAt: new Date(),
  });

  return { workspace, campaign, brief, item };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(analyticsMetrics).where(eq(analyticsMetrics.contentItemId, ids.itemId));
  await db.delete(publishJobs).where(eq(publishJobs.contentItemId, ids.itemId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runAnalyticsCollection fetches and persists metrics for a published item", async () => {
  const { workspace, campaign, brief, item } = await seedPublishedItem();

  try {
    const analytics = new MockAnalyticsProvider();
    const { collected } = await runAnalyticsCollection(item.id, { analytics });

    assert.equal(collected, 6);

    const rows = await db.select().from(analyticsMetrics).where(eq(analyticsMetrics.contentItemId, item.id));
    assert.equal(rows.length, 6);
    assert.ok(rows.every((r) => r.platform === "instagram"));
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
