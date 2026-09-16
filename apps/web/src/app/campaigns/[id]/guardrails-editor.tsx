"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONTENT_FORMATS, FormatPicker, type ContentFormat } from "@/components/format-picker";

/** "KI, Webagentur, Beratung" -> ["KI", "Webagentur", "Beratung"] */
function parseTerms(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
}

export function GuardrailsEditor({
  campaignId,
  goalText,
  initialExtraInstructions,
  initialBannedTerms,
  initialAllowedFormats,
}: {
  campaignId: string;
  goalText: string;
  initialExtraInstructions: string | null;
  initialBannedTerms: string[];
  initialAllowedFormats: ContentFormat[];
}) {
  const router = useRouter();
  const [extraInstructions, setExtraInstructions] = useState(initialExtraInstructions ?? "");
  const [bannedTermsRaw, setBannedTermsRaw] = useState(initialBannedTerms.join(", "));
  const [allowedFormats, setAllowedFormats] = useState<ContentFormat[]>(
    initialAllowedFormats.length > 0 ? initialAllowedFormats : [...CONTENT_FORMATS],
  );
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const bannedTerms = parseTerms(bannedTermsRaw);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraInstructions: extraInstructions.trim() || null,
          bannedTerms,
          allowedFormats,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing(false);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">Kampagnen-Guardrails</h2>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-mono-data text-primary underline hover:text-ink-muted"
          >
            Anweisungen nachliefern
          </button>
        ) : null}
        {saved && !editing ? <span className="text-mono-data text-agent-active">gespeichert</span> : null}
      </div>

      <div className="rounded-xl bg-surface-card border border-border-subtle p-5 space-y-4">
        <div className="space-y-1">
          <p className="text-label-sm text-ink-muted uppercase tracking-wider">
            Original-Prompt (unveraenderlich)
          </p>
          <p className="text-body-md text-on-surface-variant leading-relaxed">{goalText}</p>
          <p className="text-mono-data text-ink-muted">
            Wird jedem Agenten (Strategie, Recherche, Text, Bild, QA) woertlich mitgegeben. Content
            ausserhalb dieses Briefings faellt in der QA durch und wird neu geschrieben.
          </p>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="block text-label-sm text-ink-muted uppercase tracking-wider">
                Content-Formate
              </span>
              <FormatPicker
                idPrefix={`formats-${campaignId}`}
                value={allowedFormats}
                onChange={setAllowedFormats}
              />
              <p className="text-mono-data text-ink-muted">
                Gilt fuer neu geplante Inhalte (Nachschub und kuenftige Briefs). Bereits geplante
                Items behalten ihr Format.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor={`extra-${campaignId}`}
                className="block text-label-sm text-ink-muted uppercase tracking-wider"
              >
                Zusaetzliche Anweisungen
              </label>
              <textarea
                id={`extra-${campaignId}`}
                rows={5}
                value={extraInstructions}
                onChange={(e) => setExtraInstructions(e.target.value)}
                className="w-full bg-surface-bone p-4 rounded-lg text-primary text-body-md placeholder:text-ink-muted/50 border border-border-subtle focus:outline-none focus:ring-1 focus:ring-ink-graphite transition-all"
                placeholder="z.B. Mehr konkrete Wasserwerte (pH, KH, Nitrat) statt allgemeiner Tipps. Keine Vergleiche mit anderen Branchen."
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor={`banned-${campaignId}`}
                className="block text-label-sm text-ink-muted uppercase tracking-wider"
              >
                Verbotene Begriffe (kommagetrennt)
              </label>
              <textarea
                id={`banned-${campaignId}`}
                rows={2}
                value={bannedTermsRaw}
                onChange={(e) => setBannedTermsRaw(e.target.value)}
                className="w-full bg-surface-bone p-4 rounded-lg text-primary text-body-md placeholder:text-ink-muted/50 border border-border-subtle focus:outline-none focus:ring-1 focus:ring-ink-graphite transition-all"
                placeholder="KI, Webagentur, Beratung, IT, Wendelin"
              />
              <p className="text-mono-data text-ink-muted">
                Harte Sperre: Taucht einer dieser Begriffe in Text, CTA oder Hashtags auf, faellt der
                Content ohne LLM-Pruefung durch die QA. {bannedTerms.length} Begriff(e) aktiv.
              </p>
            </div>

            {error ? <p className="text-body-md text-agent-terminating">{error}</p> : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="px-4 py-2 rounded bg-primary text-on-primary text-body-md hover:bg-primary-container transition-colors disabled:opacity-50"
              >
                {pending ? "…" : "Speichern"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setExtraInstructions(initialExtraInstructions ?? "");
                  setBannedTermsRaw(initialBannedTerms.join(", "));
                  setAllowedFormats(
                    initialAllowedFormats.length > 0
                      ? initialAllowedFormats
                      : [...CONTENT_FORMATS],
                  );
                  setEditing(false);
                  setError(null);
                }}
                className="px-4 py-2 rounded border border-border-subtle text-body-md text-ink-muted hover:bg-surface-subtle transition-colors"
              >
                Abbrechen
              </button>
              <span className="text-mono-data text-ink-muted">
                Gilt ab dem naechsten Lauf - laufende Items uebernehmen es beim naechsten Retry.
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-label-sm text-ink-muted uppercase tracking-wider">
                Nachgereichte Anweisungen
              </p>
              {extraInstructions ? (
                <p className="text-body-md text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                  {extraInstructions}
                </p>
              ) : (
                <p className="text-body-md text-ink-muted">Keine.</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-label-sm text-ink-muted uppercase tracking-wider">Content-Formate</p>
              <div className="flex flex-wrap gap-2">
                {CONTENT_FORMATS.map((f) => (
                  <span
                    key={f}
                    className={`px-2 py-0.5 rounded text-mono-data uppercase border ${
                      allowedFormats.includes(f)
                        ? "bg-surface-bone border-border-subtle text-primary"
                        : "border-border-subtle/50 text-ink-muted line-through"
                    }`}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-label-sm text-ink-muted uppercase tracking-wider">Verbotene Begriffe</p>
              {bannedTerms.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {bannedTerms.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded bg-surface-bone border border-border-subtle text-mono-data text-primary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-body-md text-ink-muted">Keine.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
