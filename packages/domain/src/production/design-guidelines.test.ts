import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { campaigns, contentBriefs, db, workspaces } from "@sma/db";
import { eq } from "drizzle-orm";
import { getDesignGuidelines } from "./design-guidelines";

async function seedBrief(designGuidelines?: string) {
  const [workspace] = await db.insert(workspaces).values({ name: `test-ws-${randomUUID()}` }).returning();
  if (!workspace) throw new Error("failed");
  const [campaign] = await db
    .insert(campaigns)
    .values({ workspaceId: workspace.id, goalText: "x", designGuidelines })
    .returning();
  if (!campaign) throw new Error("failed");
  const [brief] = await db
    .insert(contentBriefs)
    .values({ workspaceId: workspace.id, campaignId: campaign.id, topic: "Thema", format: "reel" })
    .returning();
  if (!brief) throw new Error("failed");
  return { workspace, campaign, brief };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string }) {
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("getDesignGuidelines returns the campaign's uploaded design.md content", async () => {
  const { workspace, campaign, brief } = await seedBrief("Primaerfarbe: #1A2B3C");
  try {
    const result = await getDesignGuidelines(brief.id);
    assert.equal(result, "Primaerfarbe: #1A2B3C");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id });
  }
});

test("getDesignGuidelines returns null when the campaign has none set", async () => {
  const { workspace, campaign, brief } = await seedBrief();
  try {
    const result = await getDesignGuidelines(brief.id);
    assert.equal(result, null);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id });
  }
});

after(async () => {
  await db.$client.end();
});
