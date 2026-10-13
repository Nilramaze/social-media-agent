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
import {
  contentOutputSchema,
  FakeStaticSlideRenderer,
  FakeVideoRenderer,
  qaJudgeOutputSchema,
  reelVisualBriefSchema,
  staticSlidesBriefSchema,
} from "@sma/domain";
import {
  FakeImageProvider,
  FakeLLMProvider,
  FakeStorageProvider,
  FakeVoiceProvider,
  type SearchProvider,
} from "@sma/providers";
import { and, eq } from "drizzle-orm";
import { buildProductionGraph } from "./production-graph";

function getInterrupt(result: unknown): unknown {
  return (result as { __interrupt__?: unknown }).__interrupt__;
}

/** Which review gate the graph paused at ("script" | "final"), if any. */
function getInterruptStage(result: unknown): string | undefined {
  const interrupts = getInterrupt(result) as { value?: { stage?: string } }[] | undefined;
  return interrupts?.[0]?.value?.stage;
}

const SCRIPT_APPROVED = { decision: "approved", decidedBy: "test-reviewer", stage: "script" };

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
        if (input.schema === reelVisualBriefSchema) {
          return { scenes: [{ imagePrompt: "a full inbox" }, { imagePrompt: "a clean dashboard" }] };
        }
        throw new Error("unexpected schema in test");
      },
    });

    const graph = buildProductionGraph({
      llm,
      search: new FakeSearchProvider(),
      storage: new FakeStorageProvider(),
      voice: new FakeVoiceProvider(),
      image: new FakeImageProvider(),
      renderer: new FakeVideoRenderer(),
    }).compile({
      checkpointer: new MemorySaver(),
    });

    const config = { configurable: { thread_id: item.id } };
    const first = await graph.invoke({ contentItemId: item.id }, config);
    assert.equal(getInterruptStage(first), "script");
    // QA fails the first script -> the rewrite passes the script gate again.
    const second = await graph.invoke(new Command({ resume: SCRIPT_APPROVED }), config);
    assert.equal(getInterruptStage(second), "script");
    const third = await graph.invoke(new Command({ resume: SCRIPT_APPROVED }), config);
    assert.equal(getInterruptStage(third), "final");

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
        if (input.schema === reelVisualBriefSchema) {
          return { scenes: [{ imagePrompt: "a full inbox" }, { imagePrompt: "a clean dashboard" }] };
        }
        throw new Error("unexpected schema in test");
      },
    });

    let onApprovedCalledWith: string | undefined;
    let onApprovedDelayMs: number | undefined;
    const graph = buildProductionGraph({
      llm,
      search: new FakeSearchProvider(),
      storage: new FakeStorageProvider(),
      voice: new FakeVoiceProvider(),
      image: new FakeImageProvider(),
      renderer: new FakeVideoRenderer(),
      onApproved: async (contentItemId, delayMs) => {
        onApprovedCalledWith = contentItemId;
        onApprovedDelayMs = delayMs;
      },
    }).compile({
      checkpointer: new MemorySaver(),
    });
    const config = { configurable: { thread_id: item.id } };

    const scriptPause = await graph.invoke({ contentItemId: item.id }, config);
    assert.equal(getInterruptStage(scriptPause), "script");
    const firstResult = await graph.invoke(new Command({ resume: SCRIPT_APPROVED }), config);
    assert.equal(getInterruptStage(firstResult), "final", "expected graph to pause at human_approval");

    const [afterQa] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(afterQa?.status, "ready_for_review");
    // QA pass auto-places it on the calendar, ready for the reviewer to see a proposed date.
    assert.ok(afterQa?.scheduledFor, "expected QA pass to auto-assign a calendar slot");

    const secondResult = await graph.invoke(
      new Command({
        resume: {
          decision: "changes_requested",
          target: "content",
          feedback: "Bitte den CTA staerker machen.",
          decidedBy: "test-reviewer",
          stage: "final",
        },
      }),
      config,
    );
    // A text revision is a new script, so it passes the script gate again.
    assert.equal(getInterruptStage(secondResult), "script");
    const revisedResult = await graph.invoke(new Command({ resume: SCRIPT_APPROVED }), config);
    assert.equal(getInterruptStage(revisedResult), "final", "expected a second final pause after the revision");

    const versions = await db.select().from(contentVersions).where(eq(contentVersions.contentItemId, item.id));
    assert.equal(versions.length, 2);
    assert.equal(versions[1]?.revisionFeedback, "Bitte den CTA staerker machen.");

    const [afterChangeRequest] = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.contentItemId, item.id), eq(approvals.stage, "final")));
    assert.equal(afterChangeRequest?.decision, "changes_requested");

    const finalResult = await graph.invoke(
      new Command({
        resume: { decision: "approved", decidedBy: "test-reviewer" },
      }),
      config,
    );
    assert.equal(getInterrupt(finalResult), undefined);

    const [finalItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    // "approved" transitions straight to "scheduled" once the delayed
    // publish job has been handed off - the calendar slot is what now
    // controls when it actually goes out.
    assert.equal(finalItem?.status, "scheduled");

    const allApprovals = await db.select().from(approvals).where(eq(approvals.contentItemId, item.id));
    assert.equal(allApprovals.filter((a) => a.stage === "script").length, 2);
    assert.equal(allApprovals.filter((a) => a.stage === "final").length, 2);
    assert.ok(allApprovals.some((a) => a.stage === "final" && a.decision === "approved"));
    assert.equal(onApprovedCalledWith, item.id);
    assert.ok(onApprovedDelayMs !== undefined && onApprovedDelayMs > 0, "expected a positive publish delay from the auto-assigned slot");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("carousel-format items skip voice and render via the static slide path", async () => {
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
    .values({ workspaceId: workspace.id, campaignId: campaign.id, topic: "Email-Automatisierung", format: "carousel" })
    .returning();
  if (!brief) throw new Error("failed");
  const [item] = await db
    .insert(contentItems)
    .values({ workspaceId: workspace.id, briefId: brief.id, format: "carousel" })
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
        if (input.schema === staticSlidesBriefSchema) {
          return {
            slides: [
              { text: "Volles Postfach", imagePrompt: "a stressed person facing a full inbox" },
              { text: "Aufgeraeumtes Dashboard", imagePrompt: "a clean dashboard with completed tasks" },
            ],
          };
        }
        throw new Error("unexpected schema in test");
      },
    });

    const voice = new FakeVoiceProvider();
    const staticRenderer = new FakeStaticSlideRenderer();
    const graph = buildProductionGraph({
      llm,
      search: new FakeSearchProvider(),
      storage: new FakeStorageProvider(),
      voice,
      image: new FakeImageProvider(),
      staticRenderer,
    }).compile({
      checkpointer: new MemorySaver(),
    });

    const config = { configurable: { thread_id: item.id } };
    const scriptPause = await graph.invoke({ contentItemId: item.id }, config);
    assert.equal(getInterruptStage(scriptPause), "script");
    assert.equal(staticRenderer.calls.length, 0, "nothing may render before the script is approved");
    const result = await graph.invoke(new Command({ resume: SCRIPT_APPROVED }), config);
    assert.equal(getInterruptStage(result), "final", "expected graph to pause at human_approval");

    assert.equal(voice.calls.length, 0);
    assert.equal(staticRenderer.calls.length, 2);

    const [finalItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(finalItem?.status, "ready_for_review");

    const [creative] = await db
      .select()
      .from(creativeVersions)
      .where(eq(creativeVersions.contentItemId, item.id));
    assert.equal(creative?.assetRefs.length, 2);
    assert.equal(creative?.subtitleData, null);
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

test("script gate: pauses before any media spend, revises on changes_requested, ends on rejected", async () => {
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
          return { hook: "Hook", script: "Skript", caption: "Caption", cta: "CTA", hashtags: ["#a", "#b", "#c"] };
        }
        throw new Error("no media/QA step may run before the script is approved");
      },
    });
    const voice = new FakeVoiceProvider();
    const image = new FakeImageProvider();
    const graph = buildProductionGraph({
      llm,
      search: new FakeSearchProvider(),
      storage: new FakeStorageProvider(),
      voice,
      image,
      renderer: new FakeVideoRenderer(),
    }).compile({ checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: item.id } };

    const first = await graph.invoke({ contentItemId: item.id }, config);
    assert.equal(getInterruptStage(first), "script");
    const [paused] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(paused?.status, "script_review");
    assert.equal(paused?.currentStep, null);

    // A decision meant for the final review is dropped: the item goes back
    // into the script queue and the gate keeps waiting.
    const stale = await graph.invoke(
      new Command({ resume: { decision: "approved", decidedBy: "test-reviewer", stage: "final" } }),
      config,
    );
    assert.equal(getInterruptStage(stale), "script");
    const [reopened] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(reopened?.status, "script_review");

    const revised = await graph.invoke(
      new Command({
        resume: {
          decision: "changes_requested",
          feedback: "Hook konkreter.",
          decidedBy: "test-reviewer",
          stage: "script",
        },
      }),
      config,
    );
    assert.equal(getInterruptStage(revised), "script");
    const versions = await db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.contentItemId, item.id));
    assert.equal(versions.length, 2);
    assert.ok(versions.some((v) => v.revisionFeedback === "Hook konkreter."));

    const rejected = await graph.invoke(
      new Command({ resume: { decision: "rejected", decidedBy: "test-reviewer", stage: "script" } }),
      config,
    );
    assert.equal(getInterrupt(rejected), undefined);

    const [finalItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(finalItem?.status, "rejected");
    assert.equal(voice.calls.length, 0);
    assert.equal(image.calls.length, 0);

    const scriptApprovals = await db.select().from(approvals).where(eq(approvals.contentItemId, item.id));
    assert.equal(scriptApprovals.length, 2);
    assert.ok(scriptApprovals.every((a) => a.stage === "script" && a.target === "content"));
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
