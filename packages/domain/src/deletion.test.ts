import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  approvals,
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  contentPillars,
  contentVersions,
  creativeVersions,
  db,
  qaResults,
  researchFindings,
  workspaces,
} from "@sma/db";
import { eq, sql } from "drizzle-orm";
import { deleteCampaign, deleteContentItem } from "./deletion";

async function seedFullCampaign() {
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
  const [pillar] = await db
    .insert(contentPillars)
    .values({ workspaceId: workspace.id, campaignId: campaign.id, name: "P", description: "D" })
    .returning();
  if (!pillar) throw new Error("failed");
  const [brief] = await db
    .insert(contentBriefs)
    .values({ workspaceId: workspace.id, campaignId: campaign.id, pillarId: pillar.id, topic: "T", format: "reel" })
    .returning();
  if (!brief) throw new Error("failed");
  await db.insert(researchFindings).values({
    workspaceId: workspace.id,
    briefId: brief.id,
    topic: "T",
    summary: "S",
    sources: [{ title: "x", url: "https://example.com" }],
  });
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
      hook: "H",
      script: "S",
      caption: "C",
      cta: "CTA",
      hashtags: ["#a"],
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
      assetRefs: ["k.mp4"],
    })
    .returning();
  if (!creative) throw new Error("failed");
  await db.insert(qaResults).values({
    workspaceId: workspace.id,
    contentItemId: item.id,
    contentVersionId: version.id,
    verdict: "pass",
  });
  await db.insert(approvals).values({
    workspaceId: workspace.id,
    contentItemId: item.id,
    decision: "approved",
    decidedBy: "test",
  });

  // Fake checkpoint rows for this item's thread - simulates what the
  // Postgres LangGraph checkpointer would have written.
  await db.execute(
    sql`insert into checkpoints (thread_id, checkpoint_ns, checkpoint_id, checkpoint, metadata) values (${item.id}, '', 'ck1', '{}'::jsonb, '{}'::jsonb)`,
  );
  await db.execute(
    sql`insert into checkpoint_blobs (thread_id, checkpoint_ns, channel, version, type, blob) values (${item.id}, '', 'ch1', 'v1', 'json', '\\x00')`,
  );

  return { workspace, campaign, pillar, brief, item };
}

test("deleteContentItem removes all related rows and checkpoint data", async () => {
  const { workspace, campaign, brief, item } = await seedFullCampaign();

  await deleteContentItem(item.id);

  const [remainingItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
  assert.equal(remainingItem, undefined);

  const versions = await db.select().from(contentVersions).where(eq(contentVersions.contentItemId, item.id));
  assert.equal(versions.length, 0);
  const creatives = await db.select().from(creativeVersions).where(eq(creativeVersions.contentItemId, item.id));
  assert.equal(creatives.length, 0);
  const qa = await db.select().from(qaResults).where(eq(qaResults.contentItemId, item.id));
  assert.equal(qa.length, 0);
  const appr = await db.select().from(approvals).where(eq(approvals.contentItemId, item.id));
  assert.equal(appr.length, 0);

  const checkpointCount = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from checkpoints where thread_id = ${item.id}`,
  );
  assert.equal(Array.from(checkpointCount)[0]?.count, 0);
  const blobCount = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from checkpoint_blobs where thread_id = ${item.id}`,
  );
  assert.equal(Array.from(blobCount)[0]?.count, 0);

  // cleanup the rest (brief/campaign/workspace weren't touched by this call)
  await db.delete(researchFindings).where(eq(researchFindings.briefId, brief.id));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, brief.id));
  await db.delete(contentPillars).where(eq(contentPillars.campaignId, campaign.id));
  await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, workspace.id));
  await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
});

test("deleteCampaign cascades through pillars, briefs, and every content item", async () => {
  const { workspace, campaign, item } = await seedFullCampaign();

  const result = await deleteCampaign(campaign.id);
  assert.equal(result.deletedContentItems, 1);

  const [remainingCampaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
  assert.equal(remainingCampaign, undefined);
  const [remainingItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
  assert.equal(remainingItem, undefined);
  const briefs = await db.select().from(contentBriefs).where(eq(contentBriefs.campaignId, campaign.id));
  assert.equal(briefs.length, 0);
  const pillars = await db.select().from(contentPillars).where(eq(contentPillars.campaignId, campaign.id));
  assert.equal(pillars.length, 0);

  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, workspace.id));
  await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
});

after(async () => {
  await db.$client.end();
});
