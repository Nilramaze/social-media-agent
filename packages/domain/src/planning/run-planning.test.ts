import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  brandProfiles,
  campaigns,
  contentBriefs,
  contentPillars,
  db,
  workspaces,
} from "@sma/db";
import type { LLMProvider, StructuredCallInput } from "@sma/providers";
import { eq } from "drizzle-orm";
import { runPlanning } from "./run-planning";
import type { StrategistOutput } from "./schema";

class FakeLLMProvider implements LLMProvider {
  constructor(private readonly output: StrategistOutput) {}

  async generateStructured<T>(_input: StructuredCallInput<T>): Promise<T> {
    return this.output as unknown as T;
  }
}

async function seedTestWorkspace() {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `test-workspace-${randomUUID()}` })
    .returning();
  if (!workspace) throw new Error("failed to create test workspace");

  await db.insert(brandProfiles).values({
    workspaceId: workspace.id,
    voice: "direkt und klar",
    guidelines: "keine Buzzwords",
    targetAudience: "kleine Unternehmen",
  });

  const [campaign] = await db
    .insert(campaigns)
    .values({ workspaceId: workspace.id, goalText: "Testziel" })
    .returning();
  if (!campaign) throw new Error("failed to create test campaign");

  return { workspace, campaign };
}

async function cleanup(workspaceId: string, campaignId: string) {
  await db.delete(contentBriefs).where(eq(contentBriefs.campaignId, campaignId));
  await db.delete(contentPillars).where(eq(contentPillars.campaignId, campaignId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  await db.delete(brandProfiles).where(eq(brandProfiles.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

test("runPlanning writes pillars and briefs and activates the campaign", async () => {
  const { workspace, campaign } = await seedTestWorkspace();

  try {
    const fakeOutput: StrategistOutput = {
      pillars: [
        { name: "Automatisierung", description: "KI-Automatisierung fuer KMU" },
      ],
      briefs: [
        { topic: "3 Aufgaben, die KI heute schon automatisiert", format: "reel", pillarName: "Automatisierung" },
        { topic: "Case Study: Automatisierung in der Buchhaltung", format: "carousel", pillarName: "Automatisierung" },
      ],
    };

    await runPlanning(campaign.id, { llm: new FakeLLMProvider(fakeOutput) });

    const [updatedCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    assert.equal(updatedCampaign?.status, "active");

    const pillars = await db
      .select()
      .from(contentPillars)
      .where(eq(contentPillars.campaignId, campaign.id));
    assert.equal(pillars.length, 1);
    assert.equal(pillars[0]?.name, "Automatisierung");

    const briefs = await db
      .select()
      .from(contentBriefs)
      .where(eq(contentBriefs.campaignId, campaign.id));
    assert.equal(briefs.length, 2);
    assert.ok(briefs.every((b) => b.pillarId === pillars[0]?.id));
  } finally {
    await cleanup(workspace.id, campaign.id);
  }
});

after(async () => {
  await db.$client.end();
});
