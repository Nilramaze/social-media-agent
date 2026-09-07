"use client";

import { useState } from "react";

export function DesignGuidelinesEditor({
  campaignId,
  initialValue,
}: {
  campaignId: string;
  initialValue: string | null;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setValue(await file.text());
  }

  async function save(next: string | null) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designGuidelines: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setValue(next ?? "");
      setEditing(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Design-Richtlinien</h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-mono-data text-primary underline hover:text-ink-muted"
          >
            {value ? "bearbeiten" : "design.md hochladen"}
          </button>
          {savedAt ? <span className="text-mono-data text-agent-active">gespeichert</span> : null}
        </div>
        {value ? (
          <details className="rounded-xl bg-surface-card border border-border-subtle p-5">
            <summary className="cursor-pointer text-body-md text-primary">
              {value.length} Zeichen &middot; fliesst in die Bildgenerierung ein
            </summary>
            <pre className="mt-3 whitespace-pre-wrap text-body-md text-on-surface-variant leading-relaxed font-sans">
              {value}
            </pre>
          </details>
        ) : (
          <p className="text-body-md text-ink-muted">
            Keine Design-Richtlinien hinterlegt - generierte Bilder folgen keinem festen Branding.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Design-Richtlinien bearbeiten</h2>
      <div className="flex items-center gap-3">
        <label
          htmlFor={`design-file-${campaignId}`}
          className="cursor-pointer px-4 py-2 rounded-lg border border-border-subtle bg-surface-bone text-body-md text-primary hover:border-primary transition-colors"
        >
          Datei auswaehlen…
        </label>
        <input
          id={`design-file-${campaignId}`}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          onChange={onFileChange}
          className="hidden"
        />
        <span className="text-mono-data text-ink-muted">oder direkt bearbeiten</span>
      </div>
      <textarea
        rows={8}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full bg-surface-bone p-4 rounded-lg text-primary text-body-md placeholder:text-ink-muted/50 border border-border-subtle focus:outline-none focus:ring-1 focus:ring-ink-graphite transition-all"
        placeholder="Farben, Stil, Logo-Regeln, verbotene Motive etc."
      />
      {error ? <p className="text-body-md text-agent-terminating">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => save(value.trim() || null)}
          className="px-4 py-2 rounded bg-primary text-on-primary text-body-md hover:bg-primary-container transition-colors disabled:opacity-50"
        >
          {pending ? "…" : "Speichern"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setValue(initialValue ?? "");
            setEditing(false);
            setError(null);
          }}
          className="px-4 py-2 rounded border border-border-subtle text-body-md text-ink-muted hover:bg-surface-subtle transition-colors"
        >
          Abbrechen
        </button>
        {initialValue ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(null)}
            className="ml-auto px-4 py-2 rounded border border-agent-terminating/40 text-body-md text-agent-terminating hover:bg-agent-terminating hover:text-on-error transition-colors"
          >
            Entfernen
          </button>
        ) : null}
      </div>
    </section>
  );
}
