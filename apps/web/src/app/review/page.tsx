import { contentBriefs, contentItems, db } from "@sma/db";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getReviewItems() {
  return db
    .select({
      id: contentItems.id,
      format: contentItems.format,
      createdAt: contentItems.createdAt,
      topic: contentBriefs.topic,
    })
    .from(contentItems)
    .innerJoin(contentBriefs, eq(contentItems.briefId, contentBriefs.id))
    .where(eq(contentItems.status, "ready_for_review"))
    .orderBy(desc(contentItems.createdAt));
}

export default async function ReviewQueuePage() {
  const items = await getReviewItems();

  return (
    <div className="w-full max-w-3xl mx-auto px-8 py-10 space-y-6">
      <div className="space-y-2">
        <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
          Freigabe
        </span>
        <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">Review-Queue</h1>
      </div>

      {items.length === 0 ? (
        <p className="text-body-md text-ink-muted">Nichts zu review — alles erledigt.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/review/${item.id}`}
                className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 hover:border-primary transition-colors"
              >
                <span className="text-title-md text-primary font-medium">{item.topic}</span>
                <span className="text-mono-data text-ink-muted">
                  {item.format} &middot; {new Date(item.createdAt).toLocaleString("de-DE")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
