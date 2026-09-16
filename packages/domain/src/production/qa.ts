import {
  brandProfiles,
  contentItems,
  contentVersions,
  creativeVersions,
  db as defaultDb,
  qaResults,
  type Db,
} from "@sma/db";
import type { LLMProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { NODE_MODELS } from "../model-config";
import {
  buildGuardrailBlock,
  findBannedTerms,
  getCampaignGuardrailsForItem,
} from "./campaign-context";
import { contentOutputSchema, qaJudgeOutputSchema } from "./schema";

export const QA_RETRY_LIMIT = 3;

const BUZZWORD_BLOCKLIST = [
  "revolutionaer",
  "revolutionär",
  "bahnbrechend",
  "disruptiv",
  "game changer",
  "gamechanger",
  "wegweisend",
  "einzigartig",
  "innovativste",
];

function findBuzzwords(text: string): string[] {
  const lower = text.toLowerCase();
  return BUZZWORD_BLOCKLIST.filter((word) => lower.includes(word));
}

const QA_JUDGE_SYSTEM_PROMPT = `Du bist der QA/Brand-Judge einer Social-Media-Marketing-Pipeline.
Du pruefst in dieser Reihenfolge:
1. Kampagnen-Scope (Ausschlusskriterium): Gehoeren Hook, Skript, Caption, CTA UND alle Hashtags eindeutig zum Kampagnen-Briefing? Setze scopeViolation=true und verdict="fail", sobald ein fremdes Thema, eine fremde Branche oder eine fremde Zielgruppe auftaucht - auch dann, wenn der Text nur als Analogie oder Ueberleitung dorthin fuehrt ("... genau wie in deinem Business ...") und selbst wenn der Text fuer sich genommen gut geschrieben ist. Ein einziger fremder Hashtag reicht fuer scopeViolation=true.
2. Fachliche Plausibilitaet, Tonalitaet, Hook-Staerke, CTA und Brand Guidelines. Sei streng, aber fair.
Gib "fail" nur bei echten Problemen (Scope-Verletzung, falsche Behauptungen, generischer/schwacher Hook, Ton passt nicht zur Brand Voice, fehlender oder unklarer CTA). Gib konkretes, umsetzbares Feedback; bei scopeViolation=true benenne genau, welche Stelle das Kampagnenthema verlaesst.`;

export interface RunQADeps {
  llm: LLMProvider;
  db?: Db;
}

export interface RunQAResult {
  verdict: "pass" | "fail";
  needsHumanReview: boolean;
  category: "script" | "visual" | "both" | null;
  /** The content drifted out of its campaign's briefing. */
  scopeViolation: boolean;
}

export async function runQA(
  contentItemId: string,
  deps: RunQADeps,
): Promise<RunQAResult> {
  const db = deps.db ?? defaultDb;

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);
  if (!item.currentContentVersionId) {
    throw new Error(`Content item has no current content version: ${contentItemId}`);
  }

  const [version] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.id, item.currentContentVersionId))
    .limit(1);
  if (!version) {
    throw new Error(`Content version not found: ${item.currentContentVersionId}`);
  }

  const [brandProfile] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.workspaceId, item.workspaceId))
    .limit(1);
  if (!brandProfile) {
    throw new Error(`No brand profile for workspace: ${item.workspaceId}`);
  }

  const guardrails = await getCampaignGuardrailsForItem(item.id, { db });
  if (!guardrails) {
    throw new Error(`No campaign for content item: ${item.id}`);
  }

  const schemaCheck = contentOutputSchema.safeParse({
    hook: version.hook,
    script: version.script,
    caption: version.caption,
    cta: version.cta,
    hashtags: version.hashtags,
  });
  // Hashtags are included here (unlike the buzzword scan): topic bleed from
  // another campaign shows up in the hashtags first.
  const allCopy = [
    version.hook,
    version.script,
    version.caption,
    version.cta,
    ...version.hashtags,
  ].join(" ");
  const buzzwordHits = findBuzzwords(
    [version.hook, version.script, version.caption].join(" "),
  );
  const bannedHits = findBannedTerms(allCopy, guardrails.bannedTerms);

  const structuralErrors = [
    ...(schemaCheck.success
      ? []
      : schemaCheck.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)),
    ...buzzwordHits.map((w) => `Buzzword gefunden: "${w}"`),
    ...bannedHits.map(
      (w) =>
        `Fuer diese Kampagne gesperrter Begriff gefunden: "${w}" - Thema gehoert nicht zum Kampagnen-Briefing.`,
    ),
  ];

  let verdict: "pass" | "fail" = structuralErrors.length > 0 ? "fail" : "pass";
  let feedback = structuralErrors.join("; ");
  let category: "script" | "visual" | "both" | null = verdict === "fail" ? "script" : null;

  let scopeViolation = bannedHits.length > 0;

  if (verdict === "pass") {
    const prompt = `${buildGuardrailBlock(guardrails)}

Pruefe den folgenden Content:

Hook: ${version.hook}
Skript: ${version.script}
Caption: ${version.caption}
CTA: ${version.cta}
Hashtags: ${version.hashtags.join(", ")}

Stil-Referenz des Workspace (nur Tonalitaet, NICHT Themenauswahl):
Brand Voice: ${brandProfile.voice}
Brand Guidelines: ${brandProfile.guidelines}
Uebliche Workspace-Zielgruppe: ${brandProfile.targetAudience} (nur relevant, soweit sie zum Kampagnen-Briefing passt)`;

    const judged = await deps.llm.generateStructured({
      schema: qaJudgeOutputSchema,
      system: QA_JUDGE_SYSTEM_PROMPT,
      prompt,
      model: NODE_MODELS.qaJudge,
    });
    // A scope violation fails the item even if the judge's own verdict is
    // lenient - staying inside the campaign is not a judgement call.
    scopeViolation = judged.scopeViolation;
    verdict = judged.scopeViolation ? "fail" : judged.verdict;
    feedback = judged.feedback;
    category = verdict === "fail" ? "script" : null;
  }

  if (verdict === "pass") {
    let creativeOk = Boolean(item.currentCreativeVersionId);
    if (creativeOk && item.currentCreativeVersionId) {
      const [creative] = await db
        .select()
        .from(creativeVersions)
        .where(eq(creativeVersions.id, item.currentCreativeVersionId))
        .limit(1);
      creativeOk = Boolean(creative && creative.assetRefs.length > 0);
    }
    if (!creativeOk) {
      verdict = "fail";
      category = "visual";
      feedback = "Kein gerendertes Video mit Assets vorhanden.";
    }
  }

  if (scopeViolation) {
    feedback = `SCOPE-VERLETZUNG: Der Content verlaesst das Kampagnen-Briefing. Schreibe ihn vollstaendig neu, ausschliesslich zum Kampagnenthema - inklusive Hashtags. ${feedback}`;
  }

  await db.insert(qaResults).values({
    workspaceId: item.workspaceId,
    contentItemId: item.id,
    contentVersionId: version.id,
    verdict,
    category,
    schemaErrors: structuralErrors.length > 0 ? structuralErrors : null,
    judgeFeedback: feedback || null,
  });

  if (verdict === "pass") {
    await db
      .update(contentItems)
      .set({ status: "ready_for_review" })
      .where(eq(contentItems.id, item.id));
    return { verdict: "pass", needsHumanReview: false, category: null, scopeViolation: false };
  }

  const newRetryCount = item.qaRetryCount + 1;
  const needsHumanReview = newRetryCount > QA_RETRY_LIMIT;
  await db
    .update(contentItems)
    .set({
      qaRetryCount: newRetryCount,
      status: needsHumanReview ? "needs_human_review" : "drafting",
    })
    .where(eq(contentItems.id, item.id));

  return { verdict: "fail", needsHumanReview, category, scopeViolation };
}
