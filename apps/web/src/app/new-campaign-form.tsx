"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewCampaignForm() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [designGuidelines, setDesignGuidelines] = useState("");
  const [designFileName, setDesignFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDesignFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setDesignGuidelines(text);
    setDesignFileName(file.name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalText,
          ...(designGuidelines ? { designGuidelines } : {}),
        }),
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <label htmlFor="goal-text" className="font-sans text-label-md text-on-surface-variant uppercase tracking-wider">
          Kampagnenziel
        </label>
        <span className="font-sans text-mono-data text-ink-muted">Erforderlich</span>
      </div>
      <textarea
        id="goal-text"
        required
        className="w-full bg-surface-bone p-4 rounded-lg text-primary text-body-lg placeholder:text-ink-muted/50 border border-border-subtle focus:outline-none focus:ring-1 focus:ring-ink-graphite transition-all resize-none"
        rows={3}
        placeholder="z.B. Leads fuer KI-Automatisierungsprojekte bei kleinen Unternehmen gewinnen"
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <label htmlFor="design-file" className="font-sans text-label-md text-on-surface-variant uppercase tracking-wider">
          Design-Richtlinien (design.md)
        </label>
        <span className="font-sans text-mono-data text-ink-muted">Optional</span>
      </div>
      <div className="flex items-center gap-3">
        <label
          htmlFor="design-file"
          className="cursor-pointer px-4 py-2.5 rounded-lg border border-border-subtle bg-surface-bone text-body-md text-primary hover:border-primary transition-colors"
        >
          Datei auswaehlen…
        </label>
        <input
          id="design-file"
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          onChange={onDesignFileChange}
          className="hidden"
        />
        {designFileName ? (
          <span className="text-mono-data text-ink-muted truncate">
            {designFileName} ({designGuidelines.length} Zeichen)
          </span>
        ) : (
          <span className="text-mono-data text-ink-muted">
            Farben, Stil, Logo-Regeln etc. - fliesst in die Bildgenerierung ein.
          </span>
        )}
      </div>
      {error ? <p className="text-body-md text-agent-terminating">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || goalText.trim().length === 0}
        className="w-full bg-primary hover:bg-primary-container active:scale-[0.98] text-on-primary text-body-lg py-3.5 px-6 rounded-lg font-medium transition-all disabled:opacity-50 disabled:active:scale-100"
      >
        {pending ? "Wird angelegt…" : "Kampagne starten"}
      </button>
    </form>
  );
}
