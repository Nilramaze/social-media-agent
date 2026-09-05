import {
  contentBriefs,
  contentItems,
  contentVersions,
  db,
  qaResults,
  researchFindings,
} from "@sma/db";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ReviewActions } from "./actions";

export const dynamic = "force-dynamic";

async function getContentItemDetail(id: string) {
  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!item) return null;

  const [brief] = await db.select().from(contentBriefs).where(eq(contentBriefs.id, item.briefId)).limit(1);

  const versions = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.contentItemId, id))
    .orderBy(desc(contentVersions.versionNumber));

  const currentVersion =
    versions.find((v) => v.id === item.currentContentVersionId) ?? versions[0] ?? null;

  const [research] = brief
    ? await db
        .select()
        .from(researchFindings)
        .where(eq(researchFindings.briefId, brief.id))
        .orderBy(desc(researchFindings.createdAt))
        .limit(1)
    : [];

  const qaHistory = await db
    .select()
    .from(qaResults)
    .where(eq(qaResults.contentItemId, id))
    .orderBy(desc(qaResults.createdAt));

  return { item, brief, currentVersion, research: research ?? null, qaHistory };
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getContentItemDetail(id);
  if (!data) notFound();

  const { item, brief, currentVersion, research, qaHistory } = data;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{brief?.topic ?? "Content"}</h1>
        <p className="text-sm text-neutral-500">
          {item.format} &middot; Status: {item.status} &middot; QA-Retries: {item.qaRetryCount}
        </p>
      </div>

      {currentVersion ? (
        <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold text-neutral-500">Hook</h2>
            <p>{currentVersion.hook}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-500">Skript</h2>
            <p className="whitespace-pre-wrap">{currentVersion.script}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-500">Caption</h2>
            <p className="whitespace-pre-wrap">{currentVersion.caption}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-500">CTA</h2>
            <p>{currentVersion.cta}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-500">Hashtags</h2>
            <p>{currentVersion.hashtags.join(" ")}</p>
          </div>
          <p className="text-xs text-neutral-400">Version {currentVersion.versionNumber}</p>
        </section>
      ) : (
        <p className="text-neutral-500">Noch keine Content-Version vorhanden.</p>
      )}

      {research ? (
        <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-500">
            Recherche-Grundlage
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{research.summary}</p>
          <ul className="mt-2 list-inside list-disc text-sm">
            {research.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {qaHistory.length > 0 ? (
        <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-500">
            QA-Historie ({qaHistory.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {qaHistory.map((qa) => (
              <li key={qa.id}>
                <span className={qa.verdict === "pass" ? "text-green-600" : "text-red-600"}>
                  {qa.verdict}
                </span>
                {qa.judgeFeedback ? ` — ${qa.judgeFeedback}` : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {item.status === "ready_for_review" ? (
        <ReviewActions contentItemId={item.id} />
      ) : (
        <p className="text-sm text-neutral-500">
          Dieses Item wartet aktuell nicht auf Review (Status: {item.status}).
        </p>
      )}
    </main>
  );
}
