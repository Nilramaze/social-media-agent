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
