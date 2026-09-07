import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  db,
  workspaces,
} from "@sma/db";
import { eq } from "drizzle-orm";
import {
  assignScheduledSlot,
  getContentItemSchedule,
  markContentItemScheduled,
  rescheduleContentItem,
  SCHEDULE_HOUR_UTC,
} from "./schedule";

async function seedCampaignWithItems(itemCount: number) {
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

  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const [item] = await db
      .insert(contentItems)
      .values({ workspaceId: workspace.id, briefId: brief.id, format: "reel" })
      .returning();
    if (!item) throw new Error("failed");
    items.push(item);
  }

  return { workspace, campaign, brief, items };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemIds: string[] }) {
  for (const itemId of ids.itemIds) {
    await db.delete(contentItems).where(eq(contentItems.id, itemId));
  }
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("assignScheduledSlot assigns the next daily slot and stacks items in the same campaign a day apart", async () => {
  const { workspace, campaign, brief, items } = await seedCampaignWithItems(2);
  const [first, second] = items;
  if (!first || !second) throw new Error("failed");

  try {
    const firstSlot = await assignScheduledSlot(first.id);
    assert.ok(firstSlot.getTime() > Date.now(), "first slot should be in the future");
    assert.equal(firstSlot.getUTCHours(), SCHEDULE_HOUR_UTC);

    const secondSlot = await assignScheduledSlot(second.id);
    assert.equal(
      secondSlot.getTime() - firstSlot.getTime(),
      24 * 60 * 60 * 1000,
      "second item in the same campaign should land exactly one day after the first",
    );

    // idempotent: re-running against an already-scheduled item returns the same slot
    const firstSlotAgain = await assignScheduledSlot(first.id);
    assert.equal(firstSlotAgain.getTime(), firstSlot.getTime());
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemIds: items.map((i) => i.id) });
  }
});

test("rescheduleContentItem overrides the slot and getContentItemSchedule reads it back", async () => {
  const { workspace, campaign, brief, items } = await seedCampaignWithItems(1);
  const [item] = items;
  if (!item) throw new Error("failed");

  try {
    await assignScheduledSlot(item.id);

    const newDate = new Date("2030-01-15T10:00:00.000Z");
    const { status } = await rescheduleContentItem(item.id, newDate);
    assert.equal(status, "researching");

    const scheduledFor = await getContentItemSchedule(item.id);
    assert.equal(scheduledFor?.getTime(), newDate.getTime());
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemIds: items.map((i) => i.id) });
  }
});

test("markContentItemScheduled sets status to scheduled", async () => {
  const { workspace, campaign, brief, items } = await seedCampaignWithItems(1);
  const [item] = items;
  if (!item) throw new Error("failed");

  try {
    await markContentItemScheduled(item.id);
    const [updated] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updated?.status, "scheduled");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemIds: items.map((i) => i.id) });
  }
});

after(async () => {
  await db.$client.end();
});
