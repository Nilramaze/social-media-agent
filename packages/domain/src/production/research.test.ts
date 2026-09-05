import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  campaigns,
  contentBriefs,
  contentItems,
  db,
  researchFindings,
  workspaces,
} from "@sma/db";
import { FakeLLMProvider } from "@sma/providers";
import type { SearchProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runResearch } from "./research";
import type { ResearchOutput } from "./schema";

class FakeSearchProvider implements SearchProvider {
  calls: string[] = [];
  async search(query: string) {
    this.calls.push(query);
    return [{ title: "Result for " + query, url: "https://example.com", content: "..." }];
  }
}

async function seedContentItem() {
  const [workspace] = await db.insert(workspaces).values({ name: `test-ws-${randomUUID()}` }).returning();
  if (!workspace) throw new Error("failed");
  const [campaign] = await db.insert(campaigns).values({ workspaceId: workspace.id, goalText: "x" }).returning();
  if (!campaign) throw new Error("failed");
  const [brief] = await db
    .insert(contentBriefs)
    .values({ workspaceId: workspace.id, campaignId: campaign.id, topic: "KI-Automatisierung fuer Buchhaltung", format: "reel" })
    .returning();
  if (!brief) throw new Error("failed");
  const [item] = await db
    .insert(contentItems)
    .values({ workspaceId: workspace.id, briefId: brief.id, format: "reel" })
    .returning();
  if (!item) throw new Error("failed");
  return { workspace, campaign, brief, item };
}

async function cleanup(ids: { workspaceId: string; campaignId: string; briefId: string; itemId: string }) {
  await db.delete(researchFindings).where(eq(researchFindings.briefId, ids.briefId));
  await db.delete(contentItems).where(eq(contentItems.id, ids.itemId));
  await db.delete(contentBriefs).where(eq(contentBriefs.id, ids.briefId));
  await db.delete(campaigns).where(eq(campaigns.id, ids.campaignId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
}

test("runResearch calls the search tool and persists sourced findings", async () => {
  const { workspace, campaign, brief, item } = await seedContentItem();
  const search = new FakeSearchProvider();

  try {
    const fakeOutput: ResearchOutput = {
      summary: "KMU sparen Zeit durch automatisierte Buchhaltung.",
      sources: [{ title: "Quelle A", url: "https://example.com/a" }],
    };

    let agenticCalled = false;
    const llm = new FakeLLMProvider({
      runAgenticStructured: (input) => {
        agenticCalled = true;
        assert.equal(input.tools.length, 1);
        assert.equal(input.tools[0]?.name, "search");
        return fakeOutput;
      },
    });

    const { researchFindingId } = await runResearch(item.id, { llm, search });
    assert.ok(agenticCalled);

    const [finding] = await db.select().from(researchFindings).where(eq(researchFindings.id, researchFindingId));
    assert.equal(finding?.summary, fakeOutput.summary);
    assert.deepEqual(finding?.sources, fakeOutput.sources);

    const [updatedItem] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    assert.equal(updatedItem?.status, "drafting");
  } finally {
    await cleanup({ workspaceId: workspace.id, campaignId: campaign.id, briefId: brief.id, itemId: item.id });
  }
});

after(async () => {
  await db.$client.end();
});
