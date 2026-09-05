"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteButton({
  endpoint,
  confirmText,
  redirectTo,
  label = "Löschen",
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
      className="shrink-0 rounded-md border border-red-600 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}
