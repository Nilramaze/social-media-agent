"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONTENT_FORMATS, type ContentFormat } from "@/components/format-picker";

type Pillar = { id: string; name: string; description: string };
type Brief = { id: string; topic: string; format: ContentFormat; pillarId: string | null };

const inputClass =
  "w-full rounded-lg border border-border-subtle bg-surface-bone p-2.5 text-body-md text-primary focus:outline-none focus:ring-1 focus:ring-ink-graphite disabled:opacity-50";

/**
 * Plan review: the strategist's pillars and briefs, editable before anything
 * is researched. "Freigeben" sends only what changed; "Neu planen" throws the
 * plan away and lets the strategist start over with the given feedback.
 */
export function PlanReview({
  campaignId,
  pillars: initialPillars,
  briefs: initialBriefs,
  allowedFormats,
}: {
  campaignId: string;
  pillars: Pillar[];
  briefs: Brief[];
  allowedFormats: ContentFormat[];
}) {
  const router = useRouter();
  const [pillars, setPillars] = useState(initialPillars);
  const [briefs, setBriefs] = useState(initialBriefs);
  const [removedPillars, setRemovedPillars] = useState<Set<string>>(new Set());
  const [removedBriefs, setRemovedBriefs] = useState<Set<string>>(new Set());
  const [showReplan, setShowReplan] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formats = CONTENT_FORMATS.filter((f) => allowedFormats.includes(f));
  const isBriefActive = (b: Brief) =>
    !removedBriefs.has(b.id) && !(b.pillarId && removedPillars.has(b.pillarId));
  const activeBriefCount = briefs.filter(isBriefActive).length;

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function updatePillar(id: string, patch: Partial<Pillar>) {
    setPillars((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function updateBrief(id: string, patch: Partial<Brief>) {
    setBriefs((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function buildEdits() {
    const pillarEdits = pillars.flatMap((p) => {
      const orig = initialPillars.find((o) => o.id === p.id);
      const edit = {
        id: p.id,
        ...(p.name.trim() !== orig?.name ? { name: p.name.trim() } : {}),
        ...(p.description.trim() !== orig?.description ? { description: p.description.trim() } : {}),
        ...(removedPillars.has(p.id) ? { removed: true } : {}),
      };
      return Object.keys(edit).length > 1 ? [edit] : [];
    });
    const briefEdits = briefs.flatMap((b) => {
      const orig = initialBriefs.find((o) => o.id === b.id);
      const edit = {
        id: b.id,
        ...(b.topic.trim() !== orig?.topic ? { topic: b.topic.trim() } : {}),
        ...(b.format !== orig?.format ? { format: b.format } : {}),
        ...(removedBriefs.has(b.id) ? { removed: true } : {}),
      };
      return Object.keys(edit).length > 1 ? [edit] : [];
    });
    return { pillars: pillarEdits, briefs: briefEdits };
  }

  async function post(path: string, body: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/plan/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : data.error ? JSON.stringify(data.error) : `HTTP ${res.status}`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const hasEmptyField =
    pillars.some((p) => !removedPillars.has(p.id) && (!p.name.trim() || !p.description.trim())) ||
    briefs.some((b) => isBriefActive(b) && !b.topic.trim());

  const groups: { pillar: Pillar | null; briefs: Brief[] }[] = [
    ...pillars.map((p) => ({ pillar: p, briefs: briefs.filter((b) => b.pillarId === p.id) })),
    {
      pillar: null,
      briefs: briefs.filter((b) => !b.pillarId || !pillars.some((p) => p.id === b.pillarId)),
    },
  ].filter((g) => g.pillar || g.briefs.length > 0);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-agent-standby/40 bg-agent-standby/5 p-4 text-body-md text-primary">
        Der Strategist hat {pillars.length} Content-Pillars und {briefs.length} Briefs geplant. Pruefe und
        bearbeite den Plan - erst nach der Freigabe starten Recherche und Produktion.
      </div>

      {error ? <p className="text-body-md text-agent-terminating">{error}</p> : null}

      <div className="flex flex-col gap-4">
        {groups.map(({ pillar, briefs: groupBriefs }) => {
          const pillarRemoved = pillar ? removedPillars.has(pillar.id) : false;
          return (
            <div
              key={pillar?.id ?? "no-pillar"}
              className={`rounded-lg bg-surface-card border border-border-subtle p-5 space-y-4 ${pillarRemoved ? "opacity-50" : ""}`}
            >
              {pillar ? (
                <div className="flex gap-3 items-start">
                  <div className="flex-1 space-y-2">
                    <input
                      className={`${inputClass} font-serif text-title-md`}
                      value={pillar.name}
                      disabled={pending || pillarRemoved}
                      onChange={(e) => updatePillar(pillar.id, { name: e.target.value })}
                    />
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={pillar.description}
                      disabled={pending || pillarRemoved}
                      onChange={(e) => updatePillar(pillar.id, { description: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRemovedPillars((s) => toggle(s, pillar.id))}
                    className="shrink-0 rounded-lg border border-border-subtle px-3 py-2 text-body-md text-primary hover:bg-surface-subtle transition-colors"
                  >
                    {pillarRemoved ? "Wiederherstellen" : "Pillar entfernen"}
                  </button>
                </div>
              ) : (
                <h3 className="text-label-sm text-ink-muted uppercase tracking-wider">Ohne Pillar</h3>
              )}

              {groupBriefs.length === 0 ? (
                <p className="text-body-md text-ink-muted">Keine Briefs unter dieser Pillar.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {groupBriefs.map((brief) => {
                    const briefRemoved = removedBriefs.has(brief.id);
                    const disabled = pending || pillarRemoved || briefRemoved;
                    return (
                      <li
                        key={brief.id}
                        className={`flex gap-2 items-center ${briefRemoved ? "opacity-50" : ""}`}
                      >
                        <select
                          className={`${inputClass} w-32 shrink-0`}
                          value={brief.format}
                          disabled={disabled}
                          onChange={(e) => updateBrief(brief.id, { format: e.target.value as ContentFormat })}
                        >
                          {(formats.includes(brief.format) ? formats : [brief.format, ...formats]).map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        <input
                          className={`${inputClass} ${briefRemoved ? "line-through" : ""}`}
                          value={brief.topic}
                          disabled={disabled}
                          onChange={(e) => updateBrief(brief.id, { topic: e.target.value })}
                        />
                        <button
                          type="button"
                          disabled={pending || pillarRemoved}
                          onClick={() => setRemovedBriefs((s) => toggle(s, brief.id))}
                          className="shrink-0 rounded-lg border border-border-subtle px-3 py-2 text-body-md text-primary hover:bg-surface-subtle disabled:opacity-50 transition-colors"
                        >
                          {briefRemoved ? "Zurueck" : "Entfernen"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-card p-6">
        {showReplan ? (
          <>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Was soll der Strategist anders machen? (optional)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => post("replan", { feedback: feedback.trim() || undefined })}
                className="rounded-lg bg-agent-standby px-4 py-2.5 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Plan verwerfen und neu planen
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setShowReplan(false)}
                className="rounded-lg border border-border-subtle px-4 py-2.5 text-body-md text-primary hover:bg-surface-subtle transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending || activeBriefCount === 0 || hasEmptyField}
              onClick={() => post("approve", buildEdits())}
              className="flex-1 rounded-lg bg-agent-active px-4 py-3 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Freigeben und {activeBriefCount} Brief{activeBriefCount === 1 ? "" : "s"} produzieren
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowReplan(true)}
              className="flex-1 rounded-lg bg-agent-standby px-4 py-3 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Neu planen
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
