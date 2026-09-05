"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewCampaignForm() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalText }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
      }
      router.push(`/campaigns/${body.campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-3">
      <textarea
        required
        className="w-full rounded-md border border-neutral-300 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        rows={3}
        placeholder="Kampagnenziel, z.B. 'Leads fuer KI-Automatisierungsprojekte bei kleinen Unternehmen gewinnen'"
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || goalText.trim().length === 0}
        className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
      >
        {pending ? "Wird angelegt..." : "Kampagne starten"}
      </button>
    </form>
  );
}
