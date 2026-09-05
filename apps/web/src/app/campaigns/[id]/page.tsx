import {
  campaigns,
  contentBriefs,
  contentItems,
  contentPillars,
  db,
} from "@sma/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_LABELS, STEP_LABELS } from "@/lib/labels";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

async function getCampaignDetail(id: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) return null;

  const pillars = await db.select().from(contentPillars).where(eq(contentPillars.campaignId, id));
  const briefs = await db.select().from(contentBriefs).where(eq(contentBriefs.campaignId, id));

  const items = [];
  for (const brief of briefs) {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.briefId, brief.id)).limit(1);
    items.push({ brief, item: item ?? null });
  }

  return { campaign, pillars, items };
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCampaignDetail(id);
  if (!data) notFound();

  const { campaign, pillars, items } = data;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.goalText}</h1>
          <p className="text-sm text-neutral-500">
            Status: {campaign.status} &middot; {new Date(campaign.createdAt).toLocaleString("de-DE")}
          </p>
          <div className="flex gap-3 text-sm">
            <Link href="/pipeline" className="underline text-neutral-500">
              Live-Uebersicht aller Agenten
            </Link>
            <Link href="/campaigns" className="underline text-neutral-500">
              Alle Kampagnen
            </Link>
          </div>
        </div>
        <DeleteButton
          endpoint={`/api/campaigns/${campaign.id}`}
          confirmText="Diese Kampagne wirklich loeschen? Das entfernt alle zugehoerigen Content-Items, Versionen und Warteschlangen-Jobs unwiderruflich."
          redirectTo="/campaigns"
          label="Kampagne loeschen"
        />
      </div>

      {campaign.status === "failed" ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-600">
          Planning fehlgeschlagen: {campaign.planningError ?? "Unbekannter Fehler"}
        </p>
      ) : pillars.length === 0 ? (
        <p className="text-neutral-500">
          Strategist plant noch die Content-Pillars... (Seite neu laden)
        </p>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">Content-Pillars</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {pillars.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.name}</span> — {p.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">Content-Items ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-neutral-500 text-sm">Noch keine Content-Items angelegt.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map(({ brief, item }) => (
              <li
                key={brief.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                <div>
                  <p className="font-medium">{brief.topic}</p>
                  <p className="text-neutral-500">
                    {brief.format} &middot;{" "}
                    {item
                      ? item.currentStep
                        ? `${STEP_LABELS[item.currentStep] ?? item.currentStep} laeuft...`
                        : (STATUS_LABELS[item.status] ?? item.status)
                      : "wird angelegt..."}
                  </p>
                  {item?.status === "failed" && item.lastError ? (
                    <p className="text-red-600 text-xs mt-1">{item.lastError}</p>
                  ) : null}
                </div>
                {item ? (
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <Link href={`/review/${item.id}`} className="underline">
                      ansehen
                    </Link>
                    <DeleteButton
                      endpoint={`/api/content-items/${item.id}`}
                      confirmText={`Content-Item "${brief.topic}" wirklich loeschen?`}
                      label="loeschen"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
