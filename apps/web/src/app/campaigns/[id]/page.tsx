import {
  campaigns,
  contentBriefs,
  contentItems,
  contentPillars,
  db,
} from "@sma/db";
import { countUpcomingContentItems } from "@sma/domain";
import { and, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CAMPAIGN_STATUS_LABELS, STATUS_LABELS, STEP_LABELS } from "@/lib/labels";
import { DeleteButton } from "@/components/delete-button";
import { DesignGuidelinesEditor } from "./design-guidelines-editor";
import { GuardrailsEditor } from "./guardrails-editor";
import { PlanReview } from "./plan-review";
import { ReplenishControls } from "./replenish-controls";

export const dynamic = "force-dynamic";

const STATUS_DOT: Record<string, string> = {
  script_review: "bg-agent-standby",
  ready_for_review: "bg-agent-standby",
  approved: "bg-agent-active",
  published: "bg-agent-active",
  needs_human_review: "bg-agent-terminating",
  failed: "bg-agent-terminating",
  rejected: "bg-agent-terminating",
};

async function getCampaignDetail(id: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) return null;

  const pillars = await db
    .select()
    .from(contentPillars)
    .where(and(eq(contentPillars.campaignId, id), eq(contentPillars.active, true)));
  // Cancelled briefs were dropped in plan review and never get an item.
  const briefs = await db
    .select()
    .from(contentBriefs)
    .where(and(eq(contentBriefs.campaignId, id), ne(contentBriefs.status, "cancelled")));

  const items = [];
  for (const brief of briefs) {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.briefId, brief.id)).limit(1);
    items.push({ brief, item: item ?? null });
  }

  const upcoming = await countUpcomingContentItems(id);

  return { campaign, pillars, items, upcoming };
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCampaignDetail(id);
  if (!data) notFound();

  const { campaign, pillars, items, upcoming } = data;
  // While the plan is in review its briefs are edited above; items come after approval.
  const producedItems = campaign.status === "plan_review" ? [] : items;

  return (
    <div className="w-full max-w-7xl mx-auto px-8 py-10 space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
              {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
            </span>
            <span className="text-mono-data text-ink-muted">
              {new Date(campaign.createdAt).toLocaleString("de-DE")}
            </span>
          </div>
          <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">{campaign.goalText}</h1>
          <div className="flex gap-4 text-body-md">
            <Link href="/pipeline" className="underline text-ink-muted hover:text-primary">
              Live-Uebersicht
            </Link>
            <Link href="/campaigns" className="underline text-ink-muted hover:text-primary">
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

      <GuardrailsEditor
        campaignId={campaign.id}
        goalText={campaign.goalText}
        initialExtraInstructions={campaign.extraInstructions}
        initialBannedTerms={campaign.bannedTerms}
        initialAllowedFormats={campaign.allowedFormats}
      />

      <DesignGuidelinesEditor campaignId={campaign.id} initialValue={campaign.designGuidelines} />

      {campaign.status === "failed" ? (
        <p className="rounded-xl border border-agent-terminating/40 bg-agent-terminating/5 p-4 text-body-md text-agent-terminating">
          Planning fehlgeschlagen: {campaign.planningError ?? "Unbekannter Fehler"}
        </p>
      ) : campaign.status === "plan_review" ? (
        <PlanReview
          campaignId={campaign.id}
          pillars={pillars.map((p) => ({ id: p.id, name: p.name, description: p.description }))}
          briefs={items
            .filter(({ brief }) => brief.status === "planned")
            .map(({ brief }) => ({
              id: brief.id,
              topic: brief.topic,
              format: brief.format,
              pillarId: brief.pillarId,
            }))}
          allowedFormats={campaign.allowedFormats}
        />
      ) : pillars.length === 0 ? (
        <p className="text-body-md text-ink-muted">Strategist plant noch die Content-Pillars… (Seite neu laden)</p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">
            Content-Pillars ({pillars.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pillars.map((p) => (
              <div key={p.id} className="rounded-lg bg-surface-card border border-border-subtle p-5">
                <h3 className="font-serif text-title-md text-primary mb-1">{p.name}</h3>
                <p className="text-body-md text-on-surface-variant leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <ReplenishControls
        campaignId={campaign.id}
        upcoming={upcoming}
        autoReplenish={campaign.autoReplenish}
        bufferDays={campaign.autoReplenishBufferDays}
        lastReplenishedAt={campaign.lastReplenishedAt?.toISOString() ?? null}
        replenishError={campaign.replenishError}
        disabled={campaign.status !== "active" || pillars.length === 0}
      />

      <section className="space-y-3">
        <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">
          Content-Items ({producedItems.length})
        </h2>
        {producedItems.length === 0 ? (
          <p className="text-body-md text-ink-muted">Noch keine Content-Items angelegt.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {producedItems.map(({ brief, item }) => (
              <div
                key={brief.id}
                className="rounded-lg bg-surface-card border border-border-subtle p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded bg-surface-bone text-mono-data text-primary uppercase">
                      {brief.format}
                    </span>
                    {item ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-bone">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${item.currentStep ? "bg-agent-active animate-pulse" : (STATUS_DOT[item.status] ?? "bg-outline-variant")}`}
                        />
                        <span className="text-label-sm text-primary font-semibold">
                          {item.currentStep
                            ? (STEP_LABELS[item.currentStep] ?? item.currentStep)
                            : (STATUS_LABELS[item.status] ?? item.status)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-label-sm text-ink-muted">wird angelegt…</span>
                    )}
                  </div>
                  <h3 className="font-serif text-title-md text-primary mb-1">{brief.topic}</h3>
                  {item?.status === "failed" && item.lastError ? (
                    <p className="text-mono-data text-agent-terminating mt-1">{item.lastError}</p>
                  ) : null}
                </div>
                {item ? (
                  <div className="pt-4 flex items-center gap-2">
                    <Link
                      href={`/review/${item.id}`}
                      className="flex-1 text-center px-4 py-2 rounded bg-primary text-on-primary text-body-md hover:bg-primary-container transition-colors"
                    >
                      Ansehen
                    </Link>
                    <DeleteButton
                      endpoint={`/api/content-items/${item.id}`}
                      confirmText={`Content-Item "${brief.topic}" wirklich loeschen?`}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
