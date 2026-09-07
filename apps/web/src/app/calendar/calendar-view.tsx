"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { STATUS_LABELS } from "@/lib/labels";

interface CalendarItem {
  id: string;
  status: string;
  format: string;
  scheduledFor: string | null;
  topic: string;
  campaignGoal: string;
}

const POLL_INTERVAL_MS = 5000;
const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_LABELS = [
  "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const STATUS_DOT: Record<string, string> = {
  ready_for_review: "bg-agent-standby",
  approved: "bg-agent-pulse",
  scheduled: "bg-agent-pulse",
  published: "bg-agent-active",
  failed: "bg-agent-terminating",
  rejected: "bg-agent-terminating",
  changes_requested: "bg-agent-standby",
  needs_human_review: "bg-agent-standby",
};

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function ItemCard({ item, onDragStart }: { item: CalendarItem; onDragStart: (id: string) => void }) {
  return (
    <Link
      href={`/review/${item.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        onDragStart(item.id);
      }}
      className="flex items-center gap-1.5 rounded border border-border-subtle bg-surface-card px-2 py-1 text-left cursor-grab active:cursor-grabbing hover:border-primary transition-colors"
      title={`${item.topic} · ${STATUS_LABELS[item.status] ?? item.status}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[item.status] ?? "bg-ink-muted"}`} />
      <span className="text-mono-data text-primary truncate">{item.topic}</span>
    </Link>
  );
}

export function CalendarView() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/pipeline", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { items: CalendarItem[] };
        if (!cancelled) {
          setItems(body.items);
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

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      if (!item.scheduledFor || item.status === "rejected") continue;
      const key = localDayKey(new Date(item.scheduledFor));
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return map;
  }, [items]);

  const unscheduled = items.filter((i) => !i.scheduledFor && i.status !== "rejected");
  const grid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);
  const today = localDayKey(new Date());

  async function moveItemToDay(id: string, day: Date) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const target = new Date(day);
    if (item.scheduledFor) {
      const original = new Date(item.scheduledFor);
      target.setHours(original.getHours(), original.getMinutes(), 0, 0);
    } else {
      target.setUTCHours(10, 0, 0, 0);
    }

    setPendingId(id);
    // optimistic update so the drop feels instant
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, scheduledFor: target.toISOString() } : i)));
    try {
      const res = await fetch(`/api/content-items/${id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: target.toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-md text-agent-terminating">Verbindungsfehler: {error}</p> : null}

      {unscheduled.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Ohne Kalender-Termin</h2>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((item) => (
              <ItemCard key={item.id} item={item} onDragStart={setDraggingId} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="font-serif italic text-title-lg text-primary">
          {MONTH_LABELS[monthStart.getMonth()]} {monthStart.getFullYear()}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="px-2.5 py-1 rounded border border-border-subtle text-body-md text-primary hover:bg-surface-subtle transition-colors"
          >
            &larr;
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setMonthStart(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            className="px-2.5 py-1 rounded border border-border-subtle text-mono-data text-ink-muted hover:bg-surface-subtle transition-colors"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="px-2.5 py-1 rounded border border-border-subtle text-body-md text-primary hover:bg-surface-subtle transition-colors"
          >
            &rarr;
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border-subtle border border-border-subtle rounded-lg overflow-hidden">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-surface-container-low px-2 py-1.5 text-label-sm text-ink-muted uppercase tracking-wider">
            {label}
          </div>
        ))}
        {grid.map((day) => {
          const key = localDayKey(day);
          const dayItems = itemsByDay.get(key) ?? [];
          const inCurrentMonth = day.getMonth() === monthStart.getMonth();
          const isToday = key === today;

          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || draggingId;
                if (id) void moveItemToDay(id, day);
                setDraggingId(null);
              }}
              className={`min-h-[7rem] p-1.5 flex flex-col gap-1 ${
                inCurrentMonth ? "bg-surface-bone" : "bg-surface-container-low/60"
              }`}
            >
              <span
                className={`text-mono-data ${isToday ? "text-primary font-semibold" : "text-ink-muted"} ${
                  !inCurrentMonth ? "opacity-50" : ""
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {dayItems.map((item) => (
                  <div key={item.id} className={pendingId === item.id ? "opacity-50" : ""}>
                    <ItemCard item={item} onDragStart={setDraggingId} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-mono-data text-ink-muted">
        Karten koennen per Drag &amp; Drop auf einen anderen Tag verschoben werden. Ist ein Inhalt bereits freigegeben,
        wird die automatische Veroeffentlichung mitverschoben.
      </p>
    </div>
  );
}
