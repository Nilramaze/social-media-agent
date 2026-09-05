"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteButton({
  endpoint,
  confirmText,
  redirectTo,
  label = "Loeschen",
}: {
  endpoint: string;
  confirmText: string;
  redirectTo?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!window.confirm(confirmText)) return;
    setPending(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
      }
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
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
      className="shrink-0 rounded border border-agent-terminating/40 px-3 py-1.5 text-label-md text-agent-terminating hover:bg-agent-terminating hover:text-on-error transition-colors disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}
