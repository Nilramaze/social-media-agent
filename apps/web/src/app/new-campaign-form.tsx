"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONTENT_FORMATS, FormatPicker, type ContentFormat } from "@/components/format-picker";

export function NewCampaignForm() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [designGuidelines, setDesignGuidelines] = useState("");
  const [bannedTermsRaw, setBannedTermsRaw] = useState("");
  const [allowedFormats, setAllowedFormats] = useState<ContentFormat[]>([...CONTENT_FORMATS]);
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

  const bannedTerms = Array.from(
    new Set(
      bannedTermsRaw
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );

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
          ...(bannedTerms.length > 0 ? { bannedTerms } : {}),
          allowedFormats,
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
      <p className="text-mono-data text-ink-muted -mt-2">
        Dieser Text ist das bindende Briefing der Kampagne: Er geht woertlich an jeden Agenten und
        wird spaeter nicht mehr veraendert. Nachtraegliche Praezisierungen lieferst du auf der
        Kampagnenseite nach.
      </p>
      <div className="flex items-center justify-between">
        <span className="font-sans text-label-md text-on-surface-variant uppercase tracking-wider">
          Content-Formate
        </span>
        <span className="font-sans text-mono-data text-ink-muted">
          {allowedFormats.length} von {CONTENT_FORMATS.length}
        </span>
      </div>
      <FormatPicker idPrefix="new-campaign" value={allowedFormats} onChange={setAllowedFormats} />
      <p className="text-mono-data text-ink-muted -mt-2">
        Der Stratege darf nur diese Formate einplanen - abgewaehlte Formate koennen gar nicht erst
        entstehen. Spaeter auf der Kampagnenseite aenderbar.
      </p>
      <div className="flex items-center justify-between">
        <label
          htmlFor="banned-terms"
          className="font-sans text-label-md text-on-surface-variant uppercase tracking-wider"
        >
          Verbotene Begriffe
        </label>
        <span className="font-sans text-mono-data text-ink-muted">Optional</span>
      </div>
      <input
        id="banned-terms"
        type="text"
        className="w-full bg-surface-bone p-4 rounded-lg text-primary text-body-md placeholder:text-ink-muted/50 border border-border-subtle focus:outline-none focus:ring-1 focus:ring-ink-graphite transition-all"
        placeholder="kommagetrennt, z.B. KI, Webagentur, Beratung"
        value={bannedTermsRaw}
        onChange={(e) => setBannedTermsRaw(e.target.value)}
      />
      <p className="text-mono-data text-ink-muted -mt-2">
        Harte Sperre in der QA - Content mit einem dieser Begriffe in Text, CTA oder Hashtags wird
        automatisch neu geschrieben.
      </p>
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
