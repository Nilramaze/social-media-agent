import type { brandProfiles, learnings } from "@sma/db";

type BrandProfile = typeof brandProfiles.$inferSelect;
type Learning = typeof learnings.$inferSelect;

export const STRATEGIST_SYSTEM_PROMPT = `Du bist der Marketing Strategist einer Social-Media-Marketing-Pipeline fuer eine kleine KI-/Web-Agentur.
Du triffst uebergeordnete Content-Entscheidungen (Zielgruppe, Positionierung, Content-Pillars), du schreibst keine einzelnen Posts.
Stil-Vorgaben: direkt, verstaendlich, technisch kompetent, fuer Inhaber:innen kleiner Unternehmen nachvollziehbar. Keine Buzzword-Flut, keine unseriösen KI-Versprechen. Konkrete Probleme und Loesungen statt Hype.`;

export function buildStrategistPrompt(input: {
  goalText: string;
  brandProfile: BrandProfile;
  recentLearnings: Learning[];
}): string {
  const { goalText, brandProfile, recentLearnings } = input;

  const learningsSection =
    recentLearnings.length > 0
      ? recentLearnings.map((l) => `- ${l.insightText}`).join("\n")
      : "Noch keine Learnings aus vergangenen Kampagnen vorhanden.";

  return `Ziel fuer die aktuelle Kampagne:
"${goalText}"

Brand Voice: ${brandProfile.voice}
Brand Guidelines: ${brandProfile.guidelines}
Zielgruppe: ${brandProfile.targetAudience}

Learnings aus vergangenen Kampagnen:
${learningsSection}

Aufgabe:
1. Definiere 1-6 Content-Pillars (thematische Saeulen), die auf das Kampagnenziel einzahlen.
2. Leite daraus 5-15 konkrete Content-Briefs ab (Thema + Format: reel, carousel oder post), jeweils einer Pillar zugeordnet (per pillarName, muss exakt einem der oben definierten Pillar-Namen entsprechen).

Antworte ausschliesslich mit den strukturierten Daten gemaess Schema.`;
}

type Pillar = { name: string; description: string };

/**
 * Follow-up planning for a running campaign: the pillars are fixed, the
 * strategist only derives `count` new briefs and must avoid topics that
 * were already covered.
 */
export function buildReplenishPrompt(input: {
  goalText: string;
  brandProfile: BrandProfile;
  recentLearnings: Learning[];
  pillars: Pillar[];
  existingTopics: string[];
  count: number;
}): string {
  const { goalText, brandProfile, recentLearnings, pillars, existingTopics, count } = input;

  const learningsSection =
    recentLearnings.length > 0
      ? recentLearnings.map((l) => `- ${l.insightText}`).join("\n")
      : "Noch keine Learnings vorhanden.";

  const pillarsSection = pillars.map((p) => `- ${p.name}: ${p.description}`).join("\n");

  const topicsSection =
    existingTopics.length > 0 ? existingTopics.map((t) => `- ${t}`).join("\n") : "Noch keine.";

  return `Ziel der laufenden Kampagne:
"${goalText}"

Brand Voice: ${brandProfile.voice}
Brand Guidelines: ${brandProfile.guidelines}
Zielgruppe: ${brandProfile.targetAudience}

Bestehende Content-Pillars (fest, NICHT aendern oder erweitern):
${pillarsSection}

Bereits geplante oder veroeffentlichte Themen (NICHT wiederholen, auch nicht leicht umformuliert):
${topicsSection}

Learnings aus der bisherigen Performance (beruecksichtigen, was gut funktioniert hat):
${learningsSection}

Aufgabe:
Leite genau ${count} NEUE Content-Briefs ab (Thema + Format: reel, carousel oder post), jeweils einer der bestehenden Pillars zugeordnet (per pillarName, muss exakt einem der oben genannten Pillar-Namen entsprechen).
Verteile die Briefs sinnvoll ueber die Pillars und variiere die Formate.

Antworte ausschliesslich mit den strukturierten Daten gemaess Schema.`;
}
