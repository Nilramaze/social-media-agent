"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, queryKeys } from "@/lib/api";

interface AgentItem {
  id: string;
  status: string;
  currentStep: string | null;
  currentStepStartedAt: string | null;
  format: string;
  scheduledFor: string | null;
  topic: string;
  campaignId: string;
  campaignGoal: string;
}

interface PlanningCampaign {
  id: string;
  goalText: string;
  createdAt: string;
}

interface AgentsResponse {
  items: AgentItem[];
  planningCampaigns: PlanningCampaign[];
}

const POLL_INTERVAL_MS = 3000;

const STEP_AGENTS = [
  { key: "research", label: "Research-Agent", description: "Recherchiert Fakten und Quellen fuer das Thema." },
  { key: "content", label: "Content-Agent", description: "Schreibt Hook, Skript, Caption und CTA." },
  { key: "voice", label: "Voice-Agent", description: "Vertont das Skript per TTS und erzeugt Wort-Timings." },
  { key: "creative", label: "Creative-Agent", description: "Generiert Szenenbilder und rendert Reel bzw. Slides." },
  { key: "qa", label: "QA-Agent", description: "Prueft Qualitaet, Tonalitaet, Brand Guidelines und Vollstaendigkeit." },
] as const;

function elapsedSeconds(since: string | null, now: number): number | null {
  if (!since) return null;
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
}

function elapsedText(secs: number | null): string {
  if (secs === null) return "";
  if (secs < 60) return `seit ${secs}s`;
  return `seit ${Math.round(secs / 60)} min`;
}

function formatEta(target: string, now: number): string {
  const diffMs = new Date(target).getTime() - now;
  if (diffMs <= 0) return "faellig";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} Tagen`;
}

interface AgentTask {
  key: string;
  title: string;
  meta: string;
  href?: string;
}

function AgentCard({
  label,
  description,
  active,
  emptyLabel,
}: {
  label: string;
  description: string;
  active: AgentTask[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${active.length > 0 ? "bg-agent-active animate-pulse" : "bg-ink-muted"}`} />
          <h2 className="text-title-md text-primary font-medium">{label}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-bone border border-border-subtle text-mono-data text-primary">
          {active.length}
        </span>
      </div>
      <p className="text-body-md text-ink-muted">{description}</p>
      {active.length === 0 ? (
        <p className="text-mono-data text-ink-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {active.map((task) => (
            <li
              key={task.key}
              className="flex items-center justify-between gap-3 rounded border border-border-subtle bg-surface-bone px-3 py-1.5"
            >
              <span className="text-body-md text-primary truncate">{task.title}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-mono-data text-ink-muted">{task.meta}</span>
                {task.href ? (
                  <Link href={task.href} className="text-mono-data text-primary underline hover:text-ink-muted">
                    ansehen
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgentsView() {
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => apiFetch<AgentsResponse>("/api/agents"),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const items = data?.items ?? [];
  const planningCampaigns = data?.planningCampaigns ?? [];
  // Elapsed times are measured against the last successful fetch.
  const now = dataUpdatedAt;

  const scheduledQueue = items
    .filter((i): i is AgentItem & { scheduledFor: string } => i.status === "scheduled" && i.scheduledFor !== null)
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-body-md text-agent-terminating">Verbindungsfehler: {error.message}</p> : null}

      <AgentCard
        label="Strategist"
        description="Plant Kampagnen: leitet Content-Pillars und einzelne Briefs aus dem Kampagnenziel ab."
        active={planningCampaigns.map((c) => ({
          key: c.id,
          title: c.goalText,
          meta: elapsedText(elapsedSeconds(c.createdAt, now)),
        }))}
        emptyLabel="Gerade wird keine Kampagne geplant."
      />

      {STEP_AGENTS.map((agent) => {
        const active = items.filter((i) => i.currentStep === agent.key);
        return (
          <AgentCard
            key={agent.key}
            label={agent.label}
            description={agent.description}
            active={active.map((i) => ({
              key: i.id,
              title: i.topic,
              meta: elapsedText(elapsedSeconds(i.currentStepStartedAt, now)),
              href: `/review/${i.id}`,
            }))}
            emptyLabel="Gerade im Leerlauf."
          />
        );
      })}

      <AgentCard
        label="Publish-Agent"
        description="Veroeffentlicht freigegebene Inhalte automatisch zum im Kalender geplanten Termin."
        active={scheduledQueue.slice(0, 6).map((i) => ({
          key: i.id,
          title: i.topic,
          meta: formatEta(i.scheduledFor, now),
          href: `/review/${i.id}`,
        }))}
        emptyLabel="Nichts in der Warteschlange."
      />
    </div>
  );
}
