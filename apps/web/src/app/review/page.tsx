import { campaigns, contentBriefs, contentItems, contentPillars, db } from "@sma/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Both content-item gates: scripts wait before any voice/image/render spend,
 * finished items wait after QA.
 */
async function getReviewItems() {
  const rows = await db
    .select({
      id: contentItems.id,
      format: contentItems.format,
      status: contentItems.status,
      createdAt: contentItems.createdAt,
      topic: contentBriefs.topic,
    })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .where(inArray(contentItems.status, ["script_review", "ready_for_review"]))
    .orderBy(desc(contentItems.createdAt));
  return {
    scripts: rows.filter((r) => r.status === "script_review"),
    finished: rows.filter((r) => r.status === "ready_for_review"),
  };
}

type ReviewItem = Awaited<ReturnType<typeof getReviewItems>>["scripts"][number];

/** Campaigns whose strategist plan waits for approval before any research runs. */
async function getPlanReviews() {
  const rows = await db
    .select({ id: campaigns.id, goalText: campaigns.goalText, createdAt: campaigns.createdAt })
    .from(campaigns)
    .where(eq(campaigns.status, "plan_review"))
    .orderBy(desc(campaigns.createdAt));

  return Promise.all(
    rows.map(async (c) => {
      const [pillars] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contentPillars)
        .where(and(eq(contentPillars.campaignId, c.id), eq(contentPillars.active, true)));
      const [briefs] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contentBriefs)
        .where(and(eq(contentBriefs.campaignId, c.id), eq(contentBriefs.status, "planned")));
      return { ...c, pillarCount: pillars?.count ?? 0, briefCount: briefs?.count ?? 0 };
    }),
  );
}

function ReviewItemList({ items, accent }: { items: ReviewItem[]; accent?: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/review/${item.id}`}
            className={`flex flex-col gap-1 rounded-lg border ${accent ? "border-agent-standby/40" : "border-border-subtle"} bg-surface-card p-5 hover:border-primary transition-colors`}
          >
            <span className="text-title-md text-primary font-medium">{item.topic}</span>
            <span className="text-mono-data text-ink-muted">
              {item.format} &middot; {new Date(item.createdAt).toLocaleString("de-DE")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ReviewQueuePage() {
  const [plans, { scripts, finished }] = await Promise.all([getPlanReviews(), getReviewItems()]);

  return (
    <div className="w-full max-w-3xl mx-auto px-8 py-10 space-y-6">
      <div className="space-y-2">
        <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
          Freigabe
        </span>
        <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">Review-Queue</h1>
      </div>

      {plans.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">
            Content-Plaene ({plans.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/campaigns/${plan.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-agent-standby/40 bg-surface-card p-5 hover:border-primary transition-colors"
                >
                  <span className="text-title-md text-primary font-medium">{plan.goalText}</span>
                  <span className="text-mono-data text-ink-muted">
                    {plan.pillarCount} Pillars &middot; {plan.briefCount} Briefs &middot;{" "}
                    {new Date(plan.createdAt).toLocaleString("de-DE")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Both content-item gates stay visible even when empty, so the
          two-stage flow is always recognisable. */}
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">
            1. Skripte ({scripts.length})
          </h2>
          <p className="text-mono-data text-ink-muted">
            Vertonung, Bilder und Rendering starten erst nach der Freigabe.
          </p>
        </div>
        {scripts.length === 0 ? (
          <p className="text-body-md text-ink-muted">Keine Skripte zur Freigabe.</p>
        ) : (
          <ReviewItemList items={scripts} accent />
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-label-sm text-ink-muted uppercase tracking-wider">
            2. Fertige Content-Items ({finished.length})
          </h2>
          <p className="text-mono-data text-ink-muted">
            Gerendert und von QA geprueft - nach der Freigabe wird veroeffentlicht.
          </p>
        </div>
        {finished.length === 0 ? (
          <p className="text-body-md text-ink-muted">Keine fertigen Content-Items zur Freigabe.</p>
        ) : (
          <ReviewItemList items={finished} />
        )}
      </section>
    </div>
  );
}
