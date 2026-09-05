"use client";

import { useEffect, useState } from "react";

export function SidebarActivityBadge() {
  const [activeCount, setActiveCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/pipeline", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { items: { currentStep: string | null }[] };
        if (!cancelled) {
          setActiveCount(body.items.filter((i) => i.currentStep).length);
        }
      } catch {
        // stay quiet - this is a decorative status badge, not critical
      }
    }

    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-subtle bg-surface-card">
      <span
        className={`w-1.5 h-1.5 rounded-full ${activeCount ? "bg-agent-active animate-pulse" : "bg-outline-variant"}`}
      />
      <span className="font-sans text-mono-data text-primary">
        {activeCount === null ? "…" : `${activeCount} Agent${activeCount === 1 ? "" : "en"} aktiv`}
      </span>
    </div>
  );
}
