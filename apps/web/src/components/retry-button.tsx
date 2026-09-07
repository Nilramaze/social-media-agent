"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryButton({ endpoint, label = "Erneut versuchen" }: { endpoint: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onRetry() {
    setPending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? String(body.error) : `HTTP ${res.status}`);
      }
      router.refresh();
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
      className="shrink-0 rounded border border-agent-pulse/40 px-3 py-1.5 text-label-md text-agent-pulse hover:bg-agent-pulse hover:text-on-primary transition-colors disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}
