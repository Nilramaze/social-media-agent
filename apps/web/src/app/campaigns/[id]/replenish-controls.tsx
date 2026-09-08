"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_COUNT = 20;
const MAX_BUFFER_DAYS = 30;

export function ReplenishControls({
  campaignId,
  upcoming,
  autoReplenish,
  bufferDays,
  lastReplenishedAt,
  replenishError,
  disabled,
}: {
  campaignId: string;
  /** Items still ahead of publication = days of coverage at one post/day. */
  upcoming: number;
  autoReplenish: boolean;
  bufferDays: number;
  lastReplenishedAt: string | null;
  replenishError: string | null;
  /** Initial planning not finished (or failed) - nothing to build on yet. */
  disabled: boolean;
}) {
  const router = useRouter();
  const [count, setCount] = useState(5);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [auto, setAuto] = useState(autoReplenish);
  const [days, setDays] = useState(bufferDays);
  const [savingAuto, setSavingAuto] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/replenish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
      }
      setNotice(
        `${count} neue Briefs werden geplant. Die Content-Items erscheinen in Kuerze unten (Seite neu laden).`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function saveAuto(next: { autoReplenish?: boolean; autoReplenishBufferDays?: number }) {
    setSavingAuto(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Roll back the optimistic UI state.
      setAuto(autoReplenish);
      setDays(bufferDays);
    } finally {
      setSavingAuto(false);
    }
  }

  function toggleAuto() {
    const next = !auto;
    setAuto(next);
    void saveAuto({ autoReplenish: next });
  }

  function commitDays() {
    const clamped = Math.min(Math.max(Math.round(days) || 1, 1), MAX_BUFFER_DAYS);
    setDays(clamped);
    if (clamped !== bufferDays) void saveAuto({ autoReplenishBufferDays: clamped });
  }

  const coverageLow = auto && upcoming < days;

  return (
    <section className="space-y-3">
      <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Nachschub</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Manual replenish */}
        <div className="rounded-xl bg-surface-card border border-border-subtle p-5 space-y-4">
          <div>
            <h3 className="font-serif text-title-md text-primary">Neue Inhalte generieren</h3>
            <p className="text-body-md text-on-surface-variant leading-relaxed">
              Der Stratege plant weitere Briefs zu den bestehenden Pillars, vermeidet bereits
              behandelte Themen und beruecksichtigt die aktuellen Learnings.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={MAX_COUNT}
              value={count}
              disabled={disabled || pending}
              onChange={(e) => setCount(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Anzahl neuer Inhalte"
            />
            <span className="w-16 text-right text-mono-data text-primary tabular-nums">
              {count} {count === 1 ? "Inhalt" : "Inhalte"}
            </span>
          </div>
          <button
            type="button"
            disabled={disabled || pending}
            onClick={generate}
            className="px-4 py-2 rounded bg-primary text-on-primary text-body-md hover:bg-primary-container transition-colors disabled:opacity-50"
          >
            {pending ? "Wird eingereiht…" : `${count} neue ${count === 1 ? "Inhalt" : "Inhalte"} generieren`}
          </button>
          {disabled ? (
            <p className="text-mono-data text-ink-muted">
              Verfuegbar, sobald die Erstplanung abgeschlossen ist.
            </p>
          ) : null}
          {notice ? <p className="text-body-md text-agent-active">{notice}</p> : null}
        </div>

        {/* Automatic replenish */}
        <div className="rounded-xl bg-surface-card border border-border-subtle p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-serif text-title-md text-primary">Automatik</h3>
              <p className="text-body-md text-on-surface-variant leading-relaxed">
                Haelt die Kampagne automatisch gefuellt: sobald weniger als die eingestellten Tage
                an Inhalten vor der Veroeffentlichung stehen, plant der Stratege die Luecke nach.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={auto}
              disabled={disabled || savingAuto}
              onClick={toggleAuto}
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
                auto ? "bg-agent-active" : "bg-outline-variant"
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  auto ? "translate-x-5" : ""
                }`}
              />
              <span className="sr-only">Automatik {auto ? "deaktivieren" : "aktivieren"}</span>
            </button>
          </div>

          <label className="flex items-center gap-3 text-body-md text-primary">
            <span>Immer mindestens</span>
            <input
              type="number"
              min={1}
              max={MAX_BUFFER_DAYS}
              value={days}
              disabled={disabled || savingAuto}
              onChange={(e) => setDays(Number(e.target.value))}
              onBlur={commitDays}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-20 bg-surface-bone px-3 py-1.5 rounded-lg text-primary text-body-md border border-border-subtle focus:outline-none focus:ring-1 focus:ring-ink-graphite tabular-nums"
            />
            <span>Tage im Voraus gefuellt halten</span>
          </label>

          <div className="text-mono-data space-y-1">
            <p className={coverageLow ? "text-agent-standby" : "text-ink-muted"}>
              Aktuell {upcoming} {upcoming === 1 ? "Inhalt" : "Inhalte"} vor der Veroeffentlichung
              {auto ? ` (Ziel: ${days})` : ""}
              {coverageLow ? " - wird beim naechsten Check nachgeplant" : ""}
            </p>
            <p className="text-ink-muted">
              Status: {auto ? "aktiv, Check alle 15 Minuten" : "aus"}
              {lastReplenishedAt
                ? ` · zuletzt nachgeplant ${new Date(lastReplenishedAt).toLocaleString("de-DE")}`
                : ""}
            </p>
          </div>
        </div>
      </div>
      {replenishError ? (
        <p className="rounded-xl border border-agent-terminating/40 bg-agent-terminating/5 p-4 text-body-md text-agent-terminating">
          Letzte Nachplanung fehlgeschlagen: {replenishError}
        </p>
      ) : null}
      {error ? <p className="text-body-md text-agent-terminating">{error}</p> : null}
    </section>
  );
}
