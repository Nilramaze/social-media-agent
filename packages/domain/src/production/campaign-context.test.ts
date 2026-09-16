import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { campaigns, contentBriefs, contentItems, db, workspaces } from "@sma/db";
import { eq } from "drizzle-orm";
import {
  buildGuardrailBlock,
  describeAllowedFormats,
  findBannedTerms,
  getCampaignGuardrailsForBrief,
  getCampaignGuardrailsForItem,
  normalizeCampaignFormats,
} from "./campaign-context";

const AQUARIUM_GOAL =
  "Ich habe einen Plankton-Shop und moechte Kunden die Aquarien haben fuer meinen Onlineshop gewinnen. Keine KI-, Beratungs- oder IT-Themen.";

test("buildGuardrailBlock carries the original prompt verbatim", () => {
  const block = buildGuardrailBlock({
    goalText: AQUARIUM_GOAL,
    extraInstructions: null,
    bannedTerms: [],
  });

  assert.ok(block.includes(AQUARIUM_GOAL));
  assert.ok(block.includes("Harte Regeln"));
  // The analogy bridge is the exact failure mode this block exists to stop.
  assert.match(block, /Analogien/);
});

test("buildGuardrailBlock appends follow-up instructions and banned terms", () => {
  const block = buildGuardrailBlock({
    goalText: AQUARIUM_GOAL,
    extraInstructions: "Mehr konkrete Wasserwerte (pH, KH, Nitrat).",
    bannedTerms: ["KI", "Webagentur"],
  });

  assert.ok(block.includes(AQUARIUM_GOAL), "original prompt is still there");
  assert.ok(block.includes("Mehr konkrete Wasserwerte (pH, KH, Nitrat)."));
  assert.ok(block.includes("- KI"));
  assert.ok(block.includes("- Webagentur"));
});

test("buildGuardrailBlock omits empty sections", () => {
  const block = buildGuardrailBlock({
    goalText: AQUARIUM_GOAL,
    extraInstructions: "   ",
    bannedTerms: [],
  });

  assert.ok(!block.includes("Nachgereichte Anweisungen"));
  assert.ok(!block.includes("Verbotene Begriffe"));
});

test("findBannedTerms matches case-insensitively on word boundaries", () => {
  const terms = ["KI", "Beratung"];

  assert.deepEqual(findBannedTerms("Mit ki wird alles besser", terms), ["KI"]);
  assert.deepEqual(findBannedTerms("#KIfuerUnternehmen", terms), []);
  assert.deepEqual(findBannedTerms("Marketing und Verpackung", terms), []);
  assert.deepEqual(findBannedTerms("Unsere Beratung hilft", terms), ["Beratung"]);
});

test("findBannedTerms treats umlauts as word characters", () => {
  assert.deepEqual(findBannedTerms("Wasserqualitaet", ["Wasser"]), []);
  assert.deepEqual(findBannedTerms("Über KI reden", ["KI"]), ["KI"]);
});

test("normalizeCampaignFormats drops unknown values and de-duplicates", () => {
  assert.deepEqual(normalizeCampaignFormats(["post", "post", "story"]), ["post"]);
  assert.deepEqual(normalizeCampaignFormats(["reel", "carousel"]), ["reel", "carousel"]);
});

test("normalizeCampaignFormats falls back to all formats when nothing usable is stored", () => {
  assert.deepEqual(normalizeCampaignFormats([]), ["reel", "carousel", "post"]);
  assert.deepEqual(normalizeCampaignFormats(null), ["reel", "carousel", "post"]);
  assert.deepEqual(normalizeCampaignFormats(["story"]), ["reel", "carousel", "post"]);
});

test("describeAllowedFormats states the single-format case explicitly", () => {
  const single = describeAllowedFormats(["post"]);
  assert.match(single, /NUR das Format "post"/);

  const many = describeAllowedFormats(["reel", "post"]);
  assert.match(many, /Andere Formate sind nicht erlaubt/);
  assert.ok(!many.includes("carousel"));
});

async function seedCampaignChain(overrides: {
  extraInstructions?: string;
  bannedTerms?: string[];
}) {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `test-ws-${randomUUID()}` })
    .returning();
  if (!workspace) throw new Error("failed");
  const [campaign] = await db
    .insert(campaigns)
    .values({
      workspaceId: workspace.id,
      goalText: AQUARIUM_GOAL,
      extraInstructions: overrides.extraInstructions ?? null,
      bannedTerms: overrides.bannedTerms ?? [],
    })
    .returning();
  if (!campaign) throw new Error("failed");
  const [brief] = await db
    .insert(contentBriefs)
    .values({
      workspaceId: workspace.id,
      campaignId: campaign.id,
      topic: "Wasserwerte im Nano-Aquarium",
      format: "post",
    })
    .returning();
  if (!brief) throw new Error("failed");
  const [item] = await db
    .insert(contentItems)
    .values({ workspaceId: workspace.id, briefId: brief.id, format: "post" })
    .returning();
  if (!item) throw new Error("failed");
  return { workspace, campaign, brief, item };
}

async function cleanup(ids: {
  workspaceId: string;
  campaignId: string;
  briefId: string;
  itemId: string;
}) {
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("getCampaignGuardrailsForBrief resolves the brief's campaign", async () => {
  const { workspace, campaign, brief, item } = await seedCampaignChain({
    extraInstructions: "Nur Suesswasser.",
    bannedTerms: ["KI"],
  });

  try {
    const guardrails = await getCampaignGuardrailsForBrief(brief.id);
    assert.equal(guardrails?.goalText, AQUARIUM_GOAL);
    assert.equal(guardrails?.extraInstructions, "Nur Suesswasser.");
    assert.deepEqual(guardrails?.bannedTerms, ["KI"]);
  } finally {
    await cleanup({
      workspaceId: workspace.id,
      campaignId: campaign.id,
      briefId: brief.id,
      itemId: item.id,
    });
  }
});

test("getCampaignGuardrailsForItem walks item -> brief -> campaign", async () => {
  const { workspace, campaign, brief, item } = await seedCampaignChain({});

  try {
    const guardrails = await getCampaignGuardrailsForItem(item.id);
    assert.equal(guardrails?.goalText, AQUARIUM_GOAL);
    assert.deepEqual(guardrails?.bannedTerms, []);
  } finally {
    await cleanup({
      workspaceId: workspace.id,
      campaignId: campaign.id,
      briefId: brief.id,
      itemId: item.id,
    });
  }
});

after(async () => {
  await db.$client.end();
});
