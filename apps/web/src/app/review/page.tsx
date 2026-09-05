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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Review-Queue</h1>

      {items.length === 0 ? (
        <p className="text-neutral-500">Nichts zu review — alles erledigt.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/review/${item.id}`}
                className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <span className="font-medium">{item.topic}</span>
                <span className="text-sm text-neutral-500">
                  {item.format} &middot;{" "}
                  {new Date(item.createdAt).toLocaleString("de-DE")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
