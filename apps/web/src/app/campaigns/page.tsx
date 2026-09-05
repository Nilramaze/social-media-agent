import { campaigns, db } from "@sma/db";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  draft: "text-agent-standby",
  active: "text-agent-active",
  completed: "text-ink-muted",
  failed: "text-agent-terminating",
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Wird geplant",
  active: "Aktiv",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
};

export default async function CampaignsPage() {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));

  return (
    <div className="w-full max-w-4xl mx-auto px-8 py-10 space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
            Uebersicht
          </span>
          <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">Kampagnen</h1>
        </div>
        <Link
          href="/"
          className="shrink-0 bg-primary text-on-primary px-4 py-2.5 rounded-lg text-body-md font-medium hover:bg-primary-container transition-colors"
        >
          Neue Kampagne
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-body-md text-ink-muted">Noch keine Kampagnen.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-card p-5"
            >
              <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                <p className="text-title-md text-primary font-medium truncate">{c.goalText}</p>
                <p className="text-mono-data mt-1">
                  <span className={CAMPAIGN_STATUS_STYLES[c.status] ?? "text-ink-muted"}>
                    {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                  </span>
                  <span className="text-ink-muted"> &middot; {new Date(c.createdAt).toLocaleString("de-DE")}</span>
                </p>
              </Link>
              <DeleteButton
                endpoint={`/api/campaigns/${c.id}`}
                confirmText={`Kampagne "${c.goalText}" wirklich loeschen? Das entfernt alle zugehoerigen Content-Items, Versionen und Warteschlangen-Jobs unwiderruflich.`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
