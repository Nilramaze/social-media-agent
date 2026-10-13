import {
  approvals,
  brandProfiles,
  contentBriefs,
  contentItems,
  contentVersions,
  db as defaultDb,
  qaResults,
  researchFindings,
  type Db,
} from "@sma/db";
import type { LLMProvider } from "@sma/providers";
import { desc, eq } from "drizzle-orm";
import { NODE_MODELS } from "../model-config";
import { buildGuardrailBlock, getCampaignGuardrailsForBrief } from "./campaign-context";
import { contentOutputSchema } from "./schema";

const CONTENT_SYSTEM_PROMPT = `Du bist der Content Agent einer Social-Media-Marketing-Pipeline.
Du entwickelst Reel-Ideen, Hooks, Skripte, Captions und CTAs - immer fuer genau eine Kampagne.
Das Kampagnen-Briefing im Prompt legt Thema, Branche, Produkt und Zielgruppe fest und ist bindend; die Brand Voice liefert nur die Tonalitaet.
Keine Buzzword-Flut, keine leeren Versprechen. Konkrete Probleme und Loesungen statt Hype.
Auch Hashtags gehoeren zum Kampagnenthema - keine Hashtags zu fremden Branchen oder Dienstleistungen.
Das Skript ist der gesprochene Text fuer ein 30-60 Sekunden Reel: ca. 100-150 Woerter, hoechstens 2000 Zeichen. Keine Regieanweisungen, keine Szenenbeschreibungen - nur der Text, der vorgelesen wird.`;

export interface RunContentDeps {
  llm: LLMProvider;
  db?: Db;
}

export async function runContent(
  contentItemId: string,
  deps: RunContentDeps,
): Promise<{ contentVersionId: string }> {
  const db = deps.db ?? defaultDb;

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);

  const [brief] = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.id, item.briefId))
    .limit(1);
  if (!brief) throw new Error(`Content brief not found: ${item.briefId}`);

  const [finding] = await db
    .select()
    .from(researchFindings)
    .where(eq(researchFindings.briefId, brief.id))
    .orderBy(desc(researchFindings.createdAt))
    .limit(1);
  if (!finding) {
    throw new Error(`No research finding for brief: ${brief.id}`);
  }

  const [brandProfile] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.workspaceId, item.workspaceId))
    .limit(1);
  if (!brandProfile) {
    throw new Error(`No brand profile for workspace: ${item.workspaceId}`);
  }

  const existingVersions = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentItemId, item.id));
  const nextVersionNumber = existingVersions.length + 1;

  const [latestQaFail] = await db
    .select()
    .from(qaResults)
    .where(eq(qaResults.contentItemId, item.id))
    .orderBy(desc(qaResults.createdAt))
    .limit(1);
  const [latestChangeRequest] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.contentItemId, item.id))
    .orderBy(desc(approvals.decidedAt))
    .limit(1);

  const qaFeedbackAt =
    latestQaFail?.verdict === "fail" ? latestQaFail.createdAt : null;
  const changeRequestAt =
    latestChangeRequest?.decision === "changes_requested" &&
    (latestChangeRequest.target === "content" || !latestChangeRequest.target)
      ? latestChangeRequest.decidedAt
      : null;

  let revisionFeedback: string | null = null;
  if (changeRequestAt && (!qaFeedbackAt || changeRequestAt > qaFeedbackAt)) {
    revisionFeedback = latestChangeRequest?.feedback ?? null;
  } else if (qaFeedbackAt) {
    revisionFeedback = latestQaFail?.judgeFeedback ?? null;
  }

  const revisionSection = revisionFeedback
    ? `\n\nDies ist eine Ueberarbeitung. Feedback, das du unbedingt beruecksichtigen musst:\n${revisionFeedback}`
    : "";

  const guardrails = await getCampaignGuardrailsForBrief(brief.id, { db });
  if (!guardrails) {
    throw new Error(`No campaign for brief: ${brief.id}`);
  }

  const prompt = `${buildGuardrailBlock(guardrails)}

Thema: "${brief.topic}"
Format: ${item.format}

Recherche-Zusammenfassung (nur verwenden, soweit sie zum Kampagnen-Briefing passt):
${finding.summary}

Quellen:
${finding.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}

Stil-Referenz des Workspace (nur Tonalitaet, NICHT Themenauswahl):
Brand Voice: ${brandProfile.voice}
Brand Guidelines: ${brandProfile.guidelines}
Uebliche Workspace-Zielgruppe: ${brandProfile.targetAudience} (nur relevant, soweit sie zum Kampagnen-Briefing passt)

Aufgabe: Entwickle den Content fuer dieses ${item.format} (Hook, Skript, Caption, CTA, Hashtags) gemaess Schema.${revisionSection}`;

  const output = await deps.llm.generateStructured({
    schema: contentOutputSchema,
    system: CONTENT_SYSTEM_PROMPT,
    prompt,
    model: NODE_MODELS.content,
  });

  const [version] = await db
    .insert(contentVersions)
    .values({
      workspaceId: item.workspaceId,
      contentItemId: item.id,
      versionNumber: nextVersionNumber,
      hook: output.hook,
      script: output.script,
      caption: output.caption,
      cta: output.cta,
      hashtags: output.hashtags,
      createdBy: "llm",
      revisionFeedback,
    })
    .returning();
  if (!version) throw new Error("Failed to insert content version");

  // Every fresh version - first draft, QA retry or reviewer revision - waits
  // for a human script approval before voice/images/rendering spend money.
  await db
    .update(contentItems)
    .set({ currentContentVersionId: version.id, status: "script_review" })
    .where(eq(contentItems.id, item.id));

  return { contentVersionId: version.id };
}
