import {
  campaigns,
  contentBriefFormatValues,
  contentBriefs,
  contentItems,
  db as defaultDb,
  type ContentBriefFormat,
  type Db,
} from "@sma/db";
import { eq } from "drizzle-orm";

/**
 * Everything that pins a campaign to its own topic. The original prompt is
 * never rewritten - follow-up direction is appended via `extraInstructions`,
 * so an agent always sees what the campaign was commissioned for AND what was
 * clarified later.
 */
export interface CampaignGuardrails {
  goalText: string;
  extraInstructions: string | null;
  bannedTerms: string[];
}

/**
 * The binding campaign briefing, prepended to every LLM prompt in the
 * pipeline (planning, research, content, visual briefs, QA).
 *
 * Without it the downstream agents only ever saw the brief topic plus the
 * workspace brand profile, so a campaign for an aquarium shop drifted into
 * the workspace's default subject (agency/AI/IT) - usually via an analogy
 * that bridges from the campaign topic to the foreign one.
 */
export function buildGuardrailBlock(guardrails: CampaignGuardrails): string {
  const { goalText, extraInstructions, bannedTerms } = guardrails;

  const sections = [
    "=== KAMPAGNEN-BRIEFING (bindend, hat Vorrang vor allem anderen) ===",
    `Originaler Kampagnen-Prompt des Auftraggebers:\n"${goalText}"`,
  ];

  if (extraInstructions && extraInstructions.trim().length > 0) {
    sections.push(
      `Nachgereichte Anweisungen des Auftraggebers (gelten zusaetzlich, praezisieren den Prompt oben):\n${extraInstructions.trim()}`,
    );
  }

  if (bannedTerms.length > 0) {
    sections.push(
      `Verbotene Begriffe - duerfen in Hook, Skript, Caption, CTA, Hashtags, Slide-Texten und Bild-Prompts NICHT vorkommen:\n${bannedTerms
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }

  sections.push(
    `Harte Regeln:
1. Thema, Branche, Produkt und Zielgruppe kommen AUSSCHLIESSLICH aus dem Kampagnen-Prompt oben.
2. Uebernimm keine Themen, Branchen oder Beispiele aus anderen Kampagnen oder aus deiner allgemeinen Rolle.
3. Keine Analogien, Vergleiche oder Ueberleitungen, die vom Kampagnenthema auf ein fremdes Thema fuehren ("X ist wie Y im Business ..."). Das Kampagnenthema ist das Thema - nicht das Bild fuer etwas anderes.
4. Brand Voice, Brand Guidelines und die Workspace-Zielgruppe gelten NUR fuer Tonalitaet und Stil. Wo sie dem Kampagnen-Prompt inhaltlich widersprechen, gewinnt der Kampagnen-Prompt.
5. Recherche-Material, das nicht zum Kampagnen-Prompt gehoert, laesst du weg.
=== ENDE KAMPAGNEN-BRIEFING ===`,
  );

  return sections.join("\n\n");
}

export function toCampaignGuardrails(campaign: {
  goalText: string;
  extraInstructions: string | null;
  bannedTerms: string[];
}): CampaignGuardrails {
  return {
    goalText: campaign.goalText,
    extraInstructions: campaign.extraInstructions,
    bannedTerms: campaign.bannedTerms ?? [],
  };
}

export async function getCampaignGuardrails(
  campaignId: string,
  deps: { db?: Db } = {},
): Promise<CampaignGuardrails | null> {
  const db = deps.db ?? defaultDb;
  const [campaign] = await db
    .select({
      goalText: campaigns.goalText,
      extraInstructions: campaigns.extraInstructions,
      bannedTerms: campaigns.bannedTerms,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  return campaign ? toCampaignGuardrails(campaign) : null;
}

export async function getCampaignGuardrailsForBrief(
  briefId: string,
  deps: { db?: Db } = {},
): Promise<CampaignGuardrails | null> {
  const db = deps.db ?? defaultDb;
  const [row] = await db
    .select({
      goalText: campaigns.goalText,
      extraInstructions: campaigns.extraInstructions,
      bannedTerms: campaigns.bannedTerms,
    })
    .from(contentBriefs)
    .innerJoin(campaigns, eq(contentBriefs.campaignId, campaigns.id))
    .where(eq(contentBriefs.id, briefId))
    .limit(1);
  return row ? toCampaignGuardrails(row) : null;
}

export async function getCampaignGuardrailsForItem(
  contentItemId: string,
  deps: { db?: Db } = {},
): Promise<CampaignGuardrails | null> {
  const db = deps.db ?? defaultDb;
  const [row] = await db
    .select({
      goalText: campaigns.goalText,
      extraInstructions: campaigns.extraInstructions,
      bannedTerms: campaigns.bannedTerms,
    })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .innerJoin(campaigns, eq(contentBriefs.campaignId, campaigns.id))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  return row ? toCampaignGuardrails(row) : null;
}

export const ALL_CAMPAIGN_FORMATS: ContentBriefFormat[] = [...contentBriefFormatValues];

/**
 * The formats a campaign may produce, always non-empty. An empty or unknown
 * stored value falls back to all formats: a campaign that can produce nothing
 * would deadlock planning, which is worse than ignoring a bad setting.
 */
export function normalizeCampaignFormats(value: readonly string[] | null | undefined): ContentBriefFormat[] {
  const allowed = (value ?? []).filter((f): f is ContentBriefFormat =>
    (contentBriefFormatValues as readonly string[]).includes(f),
  );
  const unique = Array.from(new Set(allowed));
  return unique.length > 0 ? unique : [...ALL_CAMPAIGN_FORMATS];
}

const FORMAT_LABELS: Record<ContentBriefFormat, string> = {
  reel: "reel (Video mit Voiceover)",
  carousel: "carousel (4-6 Bild-Slides)",
  post: "post (ein einzelnes Bild)",
};

/** The format instruction for the strategist prompts. */
export function describeAllowedFormats(formats: ContentBriefFormat[]): string {
  const list = formats.map((f) => `- ${FORMAT_LABELS[f]}`).join("\n");
  const only =
    formats.length === 1
      ? `Es ist NUR das Format "${formats[0]}" erlaubt - jeder einzelne Brief muss dieses Format haben.`
      : "Andere Formate sind nicht erlaubt. Variiere die Briefs ueber genau diese Formate.";
  return `Erlaubte Content-Formate fuer diese Kampagne:
${list}
${only}`;
}

/**
 * Occurrences of the campaign's banned terms in `text`, matched
 * case-insensitively on word boundaries so "KI" does not fire on "Marketing".
 */
export function findBannedTerms(text: string, bannedTerms: string[]): string[] {
  const hits: string[] = [];
  for (const term of bannedTerms) {
    const needle = term.trim();
    if (needle.length === 0) continue;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // \b does not fire next to umlauts, so the boundary is expressed as
    // "not preceded/followed by a letter or digit" instead.
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
    if (pattern.test(text)) hits.push(needle);
  }
  return hits;
}
