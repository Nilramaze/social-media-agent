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
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showFeedback ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={target === "content"}
                onChange={() => setTarget("content")}
              />
              Text (Hook/Skript/Caption/CTA)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={target === "creative"}
                onChange={() => setTarget("creative")}
              />
              Video
            </label>
          </div>
          <textarea
            className="w-full rounded-md border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
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
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Aenderung absenden
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowFeedback(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("approved")}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Freigeben
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowFeedback(true)}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Aenderung anfordern
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("rejected")}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Ablehnen
          </button>
        </div>
      )}
    </section>
  );
}
