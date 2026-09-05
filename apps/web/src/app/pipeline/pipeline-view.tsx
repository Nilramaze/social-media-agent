"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STATUS_LABELS, STEP_LABELS } from "@/lib/labels";

interface PipelineItem {
  id: string;
  status: string;
  currentStep: string | null;
  currentStepStartedAt: string | null;
  format: string;
  qaRetryCount: number;
  topic: string;
  campaignId: string;
  campaignGoal: string;
}

const POLL_INTERVAL_MS = 2000;

function elapsedSeconds(since: string | null, now: number): number | null {
  if (!since) return null;
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
}

export function PipelineView() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const active = items.filter((i) => i.currentStep);
  const waiting = items.filter((i) => !i.currentStep && i.status === "ready_for_review");
  const rest = items.filter((i) => !i.currentStep && i.status !== "ready_for_review");

  return (
    <div className="flex flex-col gap-8">
      {error ? <p className="text-sm text-red-600">Verbindungsfehler: {error}</p> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Aktiv ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Gerade arbeitet kein Agent. (Worker laeuft? Queue leer?)
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((item) => {
              const secs = elapsedSeconds(item.currentStepStartedAt, now);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-green-500/40 bg-green-500/5 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.topic}</p>
                    <p className="text-neutral-500">
                      {STEP_LABELS[item.currentStep!] ?? item.currentStep}
                      {secs !== null ? ` · seit ${secs}s` : ""}
                    </p>
                  </div>
                  <Link href={`/review/${item.id}`} className="underline shrink-0 ml-4">
                    ansehen
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Wartet auf Freigabe ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-neutral-500">Nichts zur Freigabe offen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {waiting.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.topic}</p>
                  <p className="text-neutral-500">{item.format}</p>
                </div>
                <Link href={`/review/${item.id}`} className="underline shrink-0 ml-4">
                  freigeben
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Warteschlange &amp; Abgeschlossen ({rest.length})
        </h2>
        <ul className="flex flex-col gap-1">
          {rest.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            >
              <div className="min-w-0">
                <p className="truncate">{item.topic}</p>
                <p className="text-neutral-500 text-xs">
                  {STATUS_LABELS[item.status] ?? item.status}
                  {item.qaRetryCount > 0 ? ` · ${item.qaRetryCount} QA-Retry(s)` : ""}
                </p>
              </div>
              <Link href={`/review/${item.id}`} className="underline shrink-0 ml-4 text-xs">
                ansehen
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
