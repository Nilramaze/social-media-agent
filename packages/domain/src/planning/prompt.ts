import type { brandProfiles, ContentBriefFormat, learnings } from "@sma/db";
import {
  buildGuardrailBlock,
  describeAllowedFormats,
  type CampaignGuardrails,
} from "../production/campaign-context";

type BrandProfile = typeof brandProfiles.$inferSelect;
type Learning = typeof learnings.$inferSelect;

export const STRATEGIST_SYSTEM_PROMPT = `Du bist der Marketing Strategist einer Social-Media-Marketing-Pipeline.
Du triffst uebergeordnete Content-Entscheidungen (Zielgruppe, Positionierung, Content-Pillars), du schreibst keine einzelnen Posts.
Du arbeitest immer fuer genau EINE Kampagne. Das Kampagnen-Briefing im Prompt legt Thema, Branche, Produkt und Zielgruppe fest und ist bindend - du bringst keine Themen von aussen ein.`;

export function buildStrategistPrompt(input: {
  guardrails: CampaignGuardrails;
  allowedFormats: ContentBriefFormat[];
  brandProfile: BrandProfile;
  recentLearnings: Learning[];
  feedback?: string | undefined;
}): string {
  const { guardrails, allowedFormats, brandProfile, recentLearnings, feedback } = input;

  const feedbackSection = feedback?.trim()
    ? `

Feedback zur vorherigen, abgelehnten Planung (unbedingt umsetzen):
${feedback.trim()}`
    : "";

  const learningsSection =
    recentLearnings.length > 0
      ? recentLearnings.map((l) => `- ${l.insightText}`).join("\n")
      : "Noch keine Learnings aus vergangenen Kampagnen vorhanden.";

  return `${buildGuardrailBlock(guardrails)}

Stil-Referenz des Workspace (nur Tonalitaet, NICHT Themenauswahl):
Brand Voice: ${brandProfile.voice}
Brand Guidelines: ${brandProfile.guidelines}
Uebliche Workspace-Zielgruppe: ${brandProfile.targetAudience} (nur relevant, soweit sie zum Kampagnen-Briefing passt)

Learnings aus vergangenen Kampagnen (nur uebernehmen, was zum Kampagnen-Briefing passt):
${learningsSection}${feedbackSection}

Aufgabe:
1. Definiere 1-6 Content-Pillars (thematische Saeulen), die auf das Kampagnenziel einzahlen. Jede Pillar muss fuer sich genommen eindeutig zum Kampagnen-Briefing gehoeren - eine Pillar, die man auch in einer beliebigen anderen Branche verwenden koennte, ist zu unspezifisch.
2. Leite daraus 5-15 konkrete Content-Briefs ab (Thema + Format), jeweils einer Pillar zugeordnet (per pillarName, muss exakt einem der oben definierten Pillar-Namen entsprechen).

${describeAllowedFormats(allowedFormats)}

Antworte ausschliesslich mit den strukturierten Daten gemaess Schema.`;
}

type Pillar = { name: string; description: string };

/**
 * Follow-up planning for a running campaign: the pillars are fixed, the
 * strategist only derives `count` new briefs and must avoid topics that
 * were already covered.
 */
export function buildReplenishPrompt(input: {
  guardrails: CampaignGuardrails;
  allowedFormats: ContentBriefFormat[];
  brandProfile: BrandProfile;
  recentLearnings: Learning[];
  pillars: Pillar[];
  existingTopics: string[];
  count: number;
}): string {
  const { guardrails, allowedFormats, brandProfile, recentLearnings, pillars, existingTopics, count } =
    input;

  const learningsSection =
    recentLearnings.length > 0
      ? recentLearnings.map((l) => `- ${l.insightText}`).join("\n")
      : "Noch keine Learnings vorhanden.";

  const pillarsSection = pillars.map((p) => `- ${p.name}: ${p.description}`).join("\n");

  const topicsSection =
    existingTopics.length > 0 ? existingTopics.map((t) => `- ${t}`).join("\n") : "Noch keine.";

  return `${buildGuardrailBlock(guardrails)}

Stil-Referenz des Workspace (nur Tonalitaet, NICHT Themenauswahl):
Brand Voice: ${brandProfile.voice}
Brand Guidelines: ${brandProfile.guidelines}
Uebliche Workspace-Zielgruppe: ${brandProfile.targetAudience} (nur relevant, soweit sie zum Kampagnen-Briefing passt)

Bestehende Content-Pillars (fest, NICHT aendern oder erweitern):
${pillarsSection}

Bereits geplante oder veroeffentlichte Themen (NICHT wiederholen, auch nicht leicht umformuliert):
${topicsSection}

Learnings aus der bisherigen Performance (beruecksichtigen, was gut funktioniert hat):
${learningsSection}

Aufgabe:
Leite genau ${count} NEUE Content-Briefs ab (Thema + Format), jeweils einer der bestehenden Pillars zugeordnet (per pillarName, muss exakt einem der oben genannten Pillar-Namen entsprechen).
Jedes Thema muss fuer sich genommen eindeutig zum Kampagnen-Briefing gehoeren.
Verteile die Briefs sinnvoll ueber die Pillars.

${describeAllowedFormats(allowedFormats)}

Antworte ausschliesslich mit den strukturierten Daten gemaess Schema.`;
}
