import { desc, eq } from "drizzle-orm";
import {
  brandProfiles,
  campaigns,
  contentBriefs,
  contentPillars,
  db as defaultDb,
  learnings,
  type Db,
} from "@sma/db";
import type { LLMProvider } from "@sma/providers";
import { NODE_MODELS } from "../model-config";
import { buildStrategistPrompt, STRATEGIST_SYSTEM_PROMPT } from "./prompt";
import { strategistOutputSchema } from "./schema";

export interface RunPlanningDeps {
  llm: LLMProvider;
  db?: Db;
}

export async function runPlanning(
  campaignId: string,
  deps: RunPlanningDeps,
): Promise<void> {
  const db = deps.db ?? defaultDb;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const [brandProfile] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.workspaceId, campaign.workspaceId))
    .limit(1);
  if (!brandProfile) {
    throw new Error(`No brand profile for workspace: ${campaign.workspaceId}`);
  }

  const recentLearnings = await db
    .select()
    .from(learnings)
    .where(eq(learnings.workspaceId, campaign.workspaceId))
    .orderBy(desc(learnings.createdAt))
    .limit(10);

  const prompt = buildStrategistPrompt({
    goalText: campaign.goalText,
    brandProfile,
    recentLearnings,
  });

  const output = await deps.llm.generateStructured({
    schema: strategistOutputSchema,
    system: STRATEGIST_SYSTEM_PROMPT,
    prompt,
    model: NODE_MODELS.strategist,
  });

  const pillarNameToId = new Map<string, string>();
  for (const pillar of output.pillars) {
    const [inserted] = await db
      .insert(contentPillars)
      .values({
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        name: pillar.name,
        description: pillar.description,
      })
      .returning();
    if (inserted) pillarNameToId.set(pillar.name, inserted.id);
  }

  for (const brief of output.briefs) {
    await db.insert(contentBriefs).values({
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      pillarId: pillarNameToId.get(brief.pillarName),
      topic: brief.topic,
      format: brief.format,
    });
  }

  await db
    .update(campaigns)
    .set({ status: "active" })
    .where(eq(campaigns.id, campaign.id));
}
