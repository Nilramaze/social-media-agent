import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Command, MemorySaver } from "@langchain/langgraph";
import {
  approvals,
  brandProfiles,
  campaigns,
  contentBriefs,
  contentItems,
  contentVersions,
  creativeVersions,
  db,
  qaResults,
  researchFindings,
  workspaces,
} from "@sma/db";
import { contentOutputSchema, FakeVideoRenderer, qaJudgeOutputSchema } from "@sma/domain";
import {
  FakeLLMProvider,
  FakeStorageProvider,
  FakeVoiceProvider,
  type SearchProvider,
} from "@sma/providers";
import { eq } from "drizzle-orm";
import { buildProductionGraph } from "./production-graph";

function getInterrupt(result: unknown): unknown {
  return (result as { __interrupt__?: unknown }).__interrupt__;
}

class FakeSearchProvider implements SearchProvider {
  async search(_query: string) {
    return [{ title: "Quelle", url: "https://example.com", content: "..." }];
  }
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(approvals).where(eq(approvals.contentItemId, ids.itemId));
  await db.delete(qaResults).where(eq(qaResults.contentItemId, ids.itemId));
  await db.delete(creativeVersions).where(eq(creativeVersions.contentItemId, ids.itemId));
  await db.delete(contentVersions).where(eq(contentVersions.contentItemId, ids.itemId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(researchFindings).where(eq(researchFindings.briefId, ids.briefId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, ids.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("production graph loops back to content on QA fail, then finishes ready_for_review", async () => {
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

  try {
    let qaCallCount = 0;
    const llm = new FakeLLMProvider({
      runAgenticStructured: () => ({
        summary: "Testzusammenfassung",
        sources: [{ title: "Quelle", url: "https://example.com" }],
      }),
      generateStructured: (input) => {
        if (input.schema === contentOutputSchema) {
          return {
            hook: "Hook",
            script: "Skript",
            caption: "Caption",
            cta: "CTA",
            hashtags: ["#a", "#b", "#c"],
          };
        }
        if (input.schema === qaJudgeOutputSchema) {
          qaCallCount++;
          return qaCallCount === 1
            ? { verdict: "fail", feedback: "Hook zu schwach, bitte konkreter." }
            : { verdict: "pass", feedback: "Passt." };
        }
        throw new Error("unexpected schema in test");
      },
    });

    const graph = buildProductionGraph({
      llm,
      search: new FakeSearchProvider(),
      storage: new FakeStorageProvider(),
      voice: new FakeVoiceProvider(),
      renderer: new FakeVideoRenderer(),
    }).compile({
      checkpointer: new MemorySaver(),
    });

    await graph.invoke(
      { contentItemId: item.id },
      { configurable: { thread_id: item.id } },
    );

    assert.equal(qaCallCount, 2);

    const [finalItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(finalItem?.status, "ready_for_review");
    assert.equal(finalItem?.qaRetryCount, 1);

    const versions = await db.select().from(contentVersions).where(eq(contentVersions.contentItemId, item.id));
    assert.equal(versions.length, 2);

    const results = await db.select().from(qaResults).where(eq(qaResults.contentItemId, item.id));
    assert.equal(results.length, 2);
    assert.equal(results.filter((r) => r.verdict === "fail").length, 1);
    assert.equal(results.filter((r) => r.verdict === "pass").length, 1);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("human approval gate: interrupts on QA pass, loops on changes_requested, ends on approved", async () => {
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

  try {
    const llm = new FakeLLMProvider({
      runAgenticStructured: () => ({
        summary: "Testzusammenfassung",
        sources: [{ title: "Quelle", url: "https://example.com" }],
      }),
      generateStructured: (input) => {
        if (input.schema === contentOutputSchema) {
          return {
            hook: "Hook",
            script: "Skript",
            caption: "Caption",
            cta: "CTA",
            hashtags: ["#a", "#b", "#c"],
          };
        }
        if (input.schema === qaJudgeOutputSchema) {
          return { verdict: "pass", feedback: "Passt." };
        }
        throw new Error("unexpected schema in test");
      },
    });

    let onApprovedCalledWith: string | undefined;
    const graph = buildProductionGraph({
      llm,
      search: new FakeSearchProvider(),
      storage: new FakeStorageProvider(),
      voice: new FakeVoiceProvider(),
      renderer: new FakeVideoRenderer(),
      onApproved: async (contentItemId) => {
        onApprovedCalledWith = contentItemId;
      },
    }).compile({
      checkpointer: new MemorySaver(),
    });
    const config = { configurable: { thread_id: item.id } };

    const firstResult = await graph.invoke({ contentItemId: item.id }, config);
    assert.ok(getInterrupt(firstResult), "expected graph to pause at human_approval");

    const [afterQa] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(afterQa?.status, "ready_for_review");

    const secondResult = await graph.invoke(
      new Command({
        resume: {
          decision: "changes_requested",
          target: "content",
          feedback: "Bitte den CTA staerker machen.",
          decidedBy: "test-reviewer",
        },
      }),
      config,
    );
    assert.ok(getInterrupt(secondResult), "expected a second pause after the revision");

    const versions = await db.select().from(contentVersions).where(eq(contentVersions.contentItemId, item.id));
    assert.equal(versions.length, 2);
    assert.equal(versions[1]?.revisionFeedback, "Bitte den CTA staerker machen.");

    const [afterChangeRequest] = await db.select().from(approvals).where(eq(approvals.contentItemId, item.id));
    assert.equal(afterChangeRequest?.decision, "changes_requested");

    const finalResult = await graph.invoke(
      new Command({
        resume: { decision: "approved", decidedBy: "test-reviewer" },
      }),
      config,
    );
    assert.equal(getInterrupt(finalResult), undefined);

    const [finalItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(finalItem?.status, "approved");

    const allApprovals = await db.select().from(approvals).where(eq(approvals.contentItemId, item.id));
    assert.equal(allApprovals.length, 2);
    assert.ok(allApprovals.some((a) => a.decision === "approved"));
    assert.equal(onApprovedCalledWith, item.id);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
