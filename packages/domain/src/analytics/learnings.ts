import {
  analyticsMetrics,
  campaigns,
  contentBriefs,
  contentItems,
  contentVersions,
  db as defaultDb,
  learnings,
  type Db,
} from "@sma/db";
import type { LLMProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { NODE_MODELS } from "../model-config";
import { learningsOutputSchema } from "./schema";

const LEARNINGS_SYSTEM_PROMPT = `Du fasst Performance-Daten einer abgeschlossenen Social-Media-Kampagne fuer eine kleine KI-/Web-Agentur zusammen.
Leite EINE konkrete, umsetzbare Erkenntnis ab (z.B. welche Art Hook, Thema oder Format besser performt hat als andere).
Sei ehrlich ueber die Konfidenz: bei wenig oder widerspruechlichen Daten ist eine niedrige confidence korrekt.`;

export interface RunLearningsSummaryDeps {
  llm: LLMProvider;
  db?: Db;
}

export interface ContentPerformance {
  topic: string;
  hook: string;
  metrics: Record<string, number>;
}

export async function runLearningsSummary(
  campaignId: string,
  deps: RunLearningsSummaryDeps,
): Promise<{ learningId: string } | { skipped: true }> {
  const db = deps.db ?? defaultDb;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const publishedItems = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.status, "published"));

  const performances: ContentPerformance[] = [];
  for (const item of publishedItems) {
    const [brief] = await db
      .select()
      .from(contentBriefs)
      .where(eq(contentBriefs.id, item.briefId))
      .limit(1);
    if (!brief || brief.campaignId !== campaignId) continue;

    const [version] = item.currentContentVersionId
      ? await db
          .select()
          .from(contentVersions)
          .where(eq(contentVersions.id, item.currentContentVersionId))
          .limit(1)
      : [];
    if (!version) continue;

    const metricRows = await db
      .select()
      .from(analyticsMetrics)
      .where(eq(analyticsMetrics.contentItemId, item.id));
    if (metricRows.length === 0) continue;

    const metrics: Record<string, number> = {};
    for (const row of metricRows) {
      metrics[row.metricType] = row.value;
    }

    performances.push({ topic: brief.topic, hook: version.hook, metrics });
  }

  if (performances.length === 0) {
    return { skipped: true };
  }

  const prompt = `Kampagnenziel: "${campaign.goalText}"

Performance der veroeffentlichten Inhalte:
${performances
  .map(
    (p, i) =>
      `${i + 1}. Thema: "${p.topic}" | Hook: "${p.hook}" | Metriken: ${JSON.stringify(p.metrics)}`,
  )
  .join("\n")}

Leite eine Erkenntnis fuer zukuenftige Kampagnen-Planung ab.`;

  const output = await deps.llm.generateStructured({
    schema: learningsOutputSchema,
    system: LEARNINGS_SYSTEM_PROMPT,
    prompt,
    model: NODE_MODELS.learningsSummary,
  });

  const [learning] = await db
    .insert(learnings)
    .values({
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      insightText: output.insightText,
      supportingMetrics: performances,
      confidence: output.confidence,
    })
    .returning();
  if (!learning) throw new Error("Failed to insert learning");

  return { learningId: learning.id };
}
