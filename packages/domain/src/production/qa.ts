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

const QA_JUDGE_SYSTEM_PROMPT = `Du bist der QA/Brand-Judge einer Social-Media-Marketing-Pipeline fuer eine kleine KI-/Web-Agentur.
Du prüfst fachliche Plausibilitaet, Tonalitaet, schwache Hooks, CTA und Brand Guidelines. Sei streng, aber fair.
Gib "fail" nur bei echten Problemen (falsche Behauptungen, generischer/schwacher Hook, Ton passt nicht zur Brand Voice, fehlender oder unklarer CTA). Gib konkretes, umsetzbares Feedback.`;

export interface RunQADeps {
  llm: LLMProvider;
  db?: Db;
}

export interface RunQAResult {
  verdict: "pass" | "fail";
  needsHumanReview: boolean;
  category: "script" | "visual" | "both" | null;
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

  const schemaCheck = contentOutputSchema.safeParse({
    hook: version.hook,
    script: version.script,
    caption: version.caption,
    cta: version.cta,
    hashtags: version.hashtags,
  });
  const buzzwordHits = findBuzzwords(
    [version.hook, version.script, version.caption].join(" "),
  );

  const structuralErrors = [
    ...(schemaCheck.success
      ? []
      : schemaCheck.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)),
    ...buzzwordHits.map((w) => `Buzzword gefunden: "${w}"`),
  ];

  let verdict: "pass" | "fail" = structuralErrors.length > 0 ? "fail" : "pass";
  let feedback = structuralErrors.join("; ");
  let category: "script" | "visual" | "both" | null = verdict === "fail" ? "script" : null;

  if (verdict === "pass") {
    const prompt = `Pruefe den folgenden Content:

Hook: ${version.hook}
Skript: ${version.script}
Caption: ${version.caption}
CTA: ${version.cta}
Hashtags: ${version.hashtags.join(", ")}

Brand Voice: ${brandProfile.voice}
Brand Guidelines: ${brandProfile.guidelines}
Zielgruppe: ${brandProfile.targetAudience}`;

    const judged = await deps.llm.generateStructured({
      schema: qaJudgeOutputSchema,
      system: QA_JUDGE_SYSTEM_PROMPT,
      prompt,
      model: NODE_MODELS.qaJudge,
    });
    verdict = judged.verdict;
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
    return { verdict: "pass", needsHumanReview: false, category: null };
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

  return { verdict: "fail", needsHumanReview, category };
}
