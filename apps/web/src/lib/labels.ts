export const STATUS_LABELS: Record<string, string> = {
  researching: "Recherche laeuft",
  drafting: "Wird geschrieben",
  in_qa: "Vertonung/Rendering/QA",
  needs_human_review: "Braucht manuelle Ueberarbeitung",
  ready_for_review: "Bereit zur Freigabe",
  approved: "Freigegeben",
  changes_requested: "Aenderung angefordert",
  rejected: "Abgelehnt",
  scheduled: "Geplant",
  published: "Veroeffentlicht",
  failed: "Fehlgeschlagen",
};

export const STEP_LABELS: Record<string, string> = {
  research: "Research-Agent",
  content: "Content-Agent",
  voice: "Voice-Agent",
  creative: "Creative-Agent (Video-Rendering)",
  qa: "QA-Agent",
};
