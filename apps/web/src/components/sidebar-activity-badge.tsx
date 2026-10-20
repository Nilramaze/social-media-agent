"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, queryKeys } from "@/lib/api";

export function SidebarActivityBadge() {
  // Errors stay quiet - this is a decorative status badge, not critical.
  // Shares the pipeline cache with the pipeline view, so no duplicate fetches.
  const { data: activeCount = null } = useQuery({
    queryKey: queryKeys.pipeline,
    queryFn: () => apiFetch<{ items: { currentStep: string | null }[] }>("/api/pipeline"),
    select: (body) => body.items.filter((i) => i.currentStep).length,
    refetchInterval: 4000,
  });

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
