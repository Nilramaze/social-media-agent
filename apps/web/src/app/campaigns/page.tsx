import { campaigns, db } from "@sma/db";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Wird geplant",
  active: "Aktiv",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
};

export default async function CampaignsPage() {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Kampagnen</h1>
        <Link href="/" className="text-sm underline text-neutral-500">
          Neue Kampagne starten
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Noch keine Kampagnen.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                <p className="font-medium truncate">{c.goalText}</p>
                <p className="text-neutral-500">
                  {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status} &middot;{" "}
                  {new Date(c.createdAt).toLocaleString("de-DE")}
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
    </main>
  );
}
