"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Decision = "approved" | "changes_requested" | "rejected";
type Target = "content" | "creative";

export function ReviewActions({ contentItemId }: { contentItemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [target, setTarget] = useState<Target>("content");

  async function submit(decision: Decision, opts?: { feedback?: string; target?: Target }) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          target: opts?.target,
          feedback: opts?.feedback,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
      }
      router.push("/review");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-6">
      {error ? <p className="text-body-md text-agent-terminating">{error}</p> : null}

      {showFeedback ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-5 text-body-md text-primary">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={target === "content"} onChange={() => setTarget("content")} />
              Text (Hook/Skript/Caption/CTA)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={target === "creative"} onChange={() => setTarget("creative")} />
              Video
            </label>
          </div>
          <textarea
            className="w-full rounded-lg border border-border-subtle bg-surface-bone p-3 text-body-md text-primary focus:outline-none focus:ring-1 focus:ring-ink-graphite"
            rows={3}
            placeholder="Was soll geaendert werden?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || feedback.trim().length === 0}
              onClick={() => submit("changes_requested", { feedback: feedback.trim(), target })}
              className="rounded-lg bg-agent-standby px-4 py-2.5 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Aenderung absenden
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowFeedback(false)}
              className="rounded-lg border border-border-subtle px-4 py-2.5 text-body-md text-primary hover:bg-surface-subtle transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("approved")}
            className="flex-1 rounded-lg bg-agent-active px-4 py-3 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Freigeben
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowFeedback(true)}
            className="flex-1 rounded-lg bg-agent-standby px-4 py-3 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Aenderung anfordern
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("rejected")}
            className="flex-1 rounded-lg bg-agent-terminating px-4 py-3 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Ablehnen
          </button>
        </div>
      )}
    </section>
  );
}
