"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STATUS_LABELS, STEP_LABELS } from "@/lib/labels";

interface PipelineItem {
  id: string;
  status: string;
  currentStep: string | null;
  currentStepStartedAt: string | null;
  format: string;
  qaRetryCount: number;
  lastError: string | null;
  topic: string;
  campaignId: string;
  campaignGoal: string;
}

const POLL_INTERVAL_MS = 2000;

// Script gate (before voice/images/rendering) and final media review.
function isAwaitingReview(status: string): boolean {
  return status === "script_review" || status === "ready_for_review";
}

function elapsedSeconds(since: string | null, now: number): number | null {
  if (!since) return null;
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
}

function RetryItemButton({ id, onRetried }: { id: string; onRetried: () => void }) {
  const [pending, setPending] = useState(false);
  const [justRetried, setJustRetried] = useState(false);

  async function onRetry() {
    setPending(true);
    try {
      const res = await fetch(`/api/content-items/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onRetried();
      // Confirms the click registered even if it fails again within the
      // next poll tick (e.g. a still-missing API key) - otherwise a fast
      // re-fail looks indistinguishable from the button doing nothing.
      setJustRetried(true);
      setTimeout(() => setJustRetried(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={pending}
      className="shrink-0 rounded border border-agent-pulse/40 px-2.5 py-1 text-label-md text-agent-pulse hover:bg-agent-pulse hover:text-on-primary transition-colors disabled:opacity-50"
    >
      {pending ? "…" : justRetried ? "neu gestartet ✓" : "erneut versuchen"}
    </button>
  );
}

function RetryAllFailedButton({ count, onRetried }: { count: number; onRetried: () => void }) {
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);

  async function onRetryAll() {
    if (!window.confirm(`${count} fehlgeschlagene Content-Items erneut versuchen?`)) return;
    setPending(true);
    try {
      const res = await fetch("/api/content-items/retry-failed", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { retried: number };
      onRetried();
      setLastResult(body.retried);
      setTimeout(() => setLastResult(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onRetryAll}
      disabled={pending}
      className="px-3 py-1.5 rounded border border-agent-pulse/40 text-label-md text-agent-pulse hover:bg-agent-pulse hover:text-on-primary transition-colors disabled:opacity-50"
    >
      {pending
        ? "…"
        : lastResult !== null
          ? `${lastResult} neu gestartet ✓`
          : `Alle ${count} fehlgeschlagenen erneut versuchen`}
    </button>
  );
}

function DeleteItemButton({ id, topic }: { id: string; topic: string }) {
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Content-Item "${topic}" wirklich loeschen?`)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/content-items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // next poll cycle will drop it from the list
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      className="shrink-0 rounded border border-agent-terminating/40 px-2.5 py-1 text-label-md text-agent-terminating hover:bg-agent-terminating hover:text-on-error transition-colors disabled:opacity-50"
    >
      {pending ? "…" : "loeschen"}
    </button>
  );
}

export function PipelineView() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/pipeline", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { items: PipelineItem[] };
        if (!cancelled) {
          setItems(body.items);
          setNow(Date.now());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    pollRef.current = poll;
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const active = items.filter((i) => i.currentStep);
  const waiting = items.filter((i) => !i.currentStep && isAwaitingReview(i.status));
  const rest = items.filter((i) => !i.currentStep && !isAwaitingReview(i.status));
  const failed = rest.filter((i) => i.status === "failed");

  return (
    <div className="flex flex-col gap-8">
      {error ? <p className="text-body-md text-agent-terminating">Verbindungsfehler: {error}</p> : null}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Aktiv</h2>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-card border border-border-subtle text-mono-data text-primary">
            {active.length}
          </span>
        </div>
        {active.length === 0 ? (
          <p className="text-body-md text-ink-muted">
            Gerade arbeitet kein Agent. (Worker laeuft? Queue leer?)
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {active.map((item) => {
              const secs = elapsedSeconds(item.currentStepStartedAt, now);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-agent-active/30 bg-agent-active/5 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-agent-active animate-pulse" />
                      <span className="text-body-md font-medium text-primary truncate">{item.topic}</span>
                    </div>
                    <p className="text-mono-data text-ink-muted">
                      {STEP_LABELS[item.currentStep!] ?? item.currentStep}
                      {secs !== null ? ` · seit ${secs}s` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/review/${item.id}`}
                      className="text-body-md text-primary underline hover:text-ink-muted"
                    >
                      ansehen
                    </Link>
                    <DeleteItemButton id={item.id} topic={item.topic} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Wartet auf Freigabe</h2>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-card border border-border-subtle text-mono-data text-primary">
            {waiting.length}
          </span>
        </div>
        {waiting.length === 0 ? (
          <p className="text-body-md text-ink-muted">Nichts zur Freigabe offen.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {waiting.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-agent-standby/30 bg-agent-standby/5 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body-md font-medium text-primary truncate">{item.topic}</p>
                  <p className="text-mono-data text-ink-muted">
                    {item.format} &middot; {STATUS_LABELS[item.status] ?? item.status}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/review/${item.id}`}
                    className="text-body-md text-primary underline hover:text-ink-muted"
                  >
                    freigeben
                  </Link>
                  <DeleteItemButton id={item.id} topic={item.topic} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Warteschlange &amp; Abgeschlossen</h2>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-card border border-border-subtle text-mono-data text-primary">
            {rest.length}
          </span>
          {failed.length > 1 ? (
            <div className="ml-auto">
              <RetryAllFailedButton count={failed.length} onRetried={() => pollRef.current()} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          {rest.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${
                item.status === "failed"
                  ? "border-agent-terminating/30 bg-agent-terminating/5"
                  : "border-border-subtle bg-surface-card"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-md text-primary truncate">{item.topic}</p>
                <p className="text-mono-data text-ink-muted">
                  {STATUS_LABELS[item.status] ?? item.status}
                  {item.qaRetryCount > 0 ? ` · ${item.qaRetryCount} QA-Retry(s)` : ""}
                </p>
                {item.status === "failed" && item.lastError ? (
                  <p className="text-mono-data text-agent-terminating truncate">{item.lastError}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/review/${item.id}`} className="text-mono-data text-primary underline hover:text-ink-muted">
                  ansehen
                </Link>
                {item.status === "failed" ? (
                  <RetryItemButton id={item.id} onRetried={() => pollRef.current()} />
                ) : null}
                <DeleteItemButton id={item.id} topic={item.topic} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
