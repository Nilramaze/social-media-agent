import {
  contentBriefs,
  contentItems,
  contentVersions,
  creativeVersions,
  db,
  qaResults,
  researchFindings,
} from "@sma/db";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getStorageProvider } from "@/lib/storage";
import { STATUS_LABELS } from "@/lib/labels";
import { DeleteButton } from "@/components/delete-button";
import { RetryButton } from "@/components/retry-button";
import { ReviewActions } from "./actions";
import { MediaPreview } from "./media-preview";

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

  let mediaUrls: string[] = [];
  if (item.currentCreativeVersionId) {
    const [creative] = await db
      .select()
      .from(creativeVersions)
      .where(eq(creativeVersions.id, item.currentCreativeVersionId))
      .limit(1);
    // Reels store [video, audio, ...scene images] - only the video belongs
    // in the preview. Carousel/post store one image per slide, in order.
    const storageKeys =
      item.format === "reel" ? creative?.assetRefs.slice(0, 1) : creative?.assetRefs;
    if (storageKeys?.length) {
      const storage = getStorageProvider();
      mediaUrls = await Promise.all(
        storageKeys.map((key) => storage.getSignedUrl(key, 3600).catch(() => null)),
      ).then((urls) => urls.filter((url): url is string => url !== null));
    }
  }

  return { item, brief, currentVersion, research: research ?? null, qaHistory, mediaUrls };
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getContentItemDetail(id);
  if (!data) notFound();

  const { item, brief, currentVersion, research, qaHistory, mediaUrls } = data;

  return (
    <div className="w-full max-w-7xl mx-auto px-8 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <span className="px-2 py-0.5 rounded-full bg-surface-card text-ink-muted text-mono-data uppercase tracking-widest border border-border-subtle">
            {item.format} &middot; {STATUS_LABELS[item.status] ?? item.status}
          </span>
          <h1 className="font-serif italic text-headline-lg text-primary tracking-tight">
            {brief?.topic ?? "Content"}
          </h1>
          <p className="text-mono-data text-ink-muted">QA-Retries: {item.qaRetryCount}</p>
          {item.scheduledFor ? (
            <p className="text-mono-data text-ink-muted">
              Geplanter Termin:{" "}
              <span className="text-primary">{new Date(item.scheduledFor).toLocaleString("de-DE")}</span>
              {" · "}
              <a href="/calendar" className="underline hover:text-primary">
                im Kalender verschieben
              </a>
            </p>
          ) : null}
          {item.status === "failed" && item.lastError ? (
            <p className="text-body-md text-agent-terminating">{item.lastError}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.status === "failed" ? (
            <RetryButton endpoint={`/api/content-items/${item.id}/retry`} />
          ) : null}
          {currentVersion ? (
            <a
              href={`/api/content-items/${item.id}/text`}
              download
              className="shrink-0 rounded border border-border-subtle px-3 py-1.5 text-label-md text-primary hover:bg-surface-subtle transition-colors"
            >
              Als TXT herunterladen
            </a>
          ) : null}
          <DeleteButton
            endpoint={`/api/content-items/${item.id}`}
            confirmText={`Content-Item "${brief?.topic ?? item.id}" wirklich loeschen?`}
            redirectTo="/review"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* LEFT: editorial content + audit log */}
        <div className="xl:col-span-7 space-y-6">
          {currentVersion ? (
            <section className="rounded-xl bg-surface-card border border-border-subtle p-6 space-y-5">
              <div>
                <h2 className="text-label-sm text-ink-muted uppercase tracking-wider mb-1">Hook</h2>
                <p className="text-body-lg text-primary">{currentVersion.hook}</p>
              </div>
              <div className="h-px bg-border-subtle" />
              <div>
                <h2 className="text-label-sm text-ink-muted uppercase tracking-wider mb-1">Skript</h2>
                <p className="text-body-md text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                  {currentVersion.script}
                </p>
              </div>
              <div className="h-px bg-border-subtle" />
              <div>
                <h2 className="text-label-sm text-ink-muted uppercase tracking-wider mb-1">Caption</h2>
                <p className="text-body-md text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                  {currentVersion.caption}
                </p>
              </div>
              <div className="h-px bg-border-subtle" />
              <div>
                <h2 className="text-label-sm text-ink-muted uppercase tracking-wider mb-1">CTA</h2>
                <p className="text-body-md text-primary">{currentVersion.cta}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {currentVersion.hashtags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded bg-surface-bone text-mono-data text-primary">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-mono-data text-ink-muted">Version {currentVersion.versionNumber}</p>
              {currentVersion.revisionFeedback ? (
                <p className="text-mono-data text-ink-muted">
                  Ueberarbeitet nach Feedback: {currentVersion.revisionFeedback}
                </p>
              ) : null}
            </section>
          ) : (
            <p className="text-body-md text-ink-muted">Noch keine Content-Version vorhanden.</p>
          )}

          {research ? (
            // Open while reviewing the script: the research is what the claims in it rest on.
            <details
              open={item.status === "script_review"}
              className="rounded-xl bg-surface-card border border-border-subtle p-5"
            >
              <summary className="cursor-pointer text-label-sm text-ink-muted uppercase tracking-wider">
                Recherche-Grundlage
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-body-md text-on-surface-variant leading-relaxed">
                {research.summary}
              </p>
              <ul className="mt-3 flex flex-col gap-1">
                {research.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-mono-data text-agent-pulse underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {qaHistory.length > 0 ? (
            <section className="rounded-xl bg-surface-card border border-border-subtle p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-label-sm text-ink-muted uppercase tracking-wider">
                  Agent Activity &amp; Audit Log
                </span>
                <span className="text-mono-data text-ink-muted">{qaHistory.length} QA-Durchlaeufe</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {qaHistory.map((qa) => (
                  <div key={qa.id} className="flex items-start justify-between gap-4 p-3 rounded bg-surface-bone">
                    <div className="flex flex-col">
                      <span className={qa.verdict === "pass" ? "text-agent-active text-body-md font-medium" : "text-agent-terminating text-body-md font-medium"}>
                        {qa.verdict === "pass" ? "Pass" : "Fail"}
                        {qa.category ? ` · ${qa.category}` : ""}
                      </span>
                      {qa.judgeFeedback ? (
                        <span className="text-mono-data text-ink-muted mt-0.5">{qa.judgeFeedback}</span>
                      ) : null}
                    </div>
                    <span className="text-mono-data text-ink-muted shrink-0">
                      {new Date(qa.createdAt).toLocaleTimeString("de-DE")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* RIGHT: Instagram-style live preview */}
        <div className="xl:col-span-5 space-y-4 xl:sticky xl:top-20">
          <div className="p-3 px-4 rounded-xl bg-surface-card border border-border-subtle flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-agent-standby animate-pulse" />
            <span className="text-label-md text-primary">Vorschau</span>
          </div>

          <div className="w-full max-w-[420px] mx-auto bg-surface-bone rounded-2xl border border-border-subtle overflow-hidden flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-agent-standby via-agent-pulse to-ink-graphite p-[1.5px]">
                  <div className="w-full h-full rounded-full bg-surface-subtle" />
                </div>
                <span className="text-body-md font-semibold text-primary">dein_account</span>
              </div>
              <span className="material-symbols-outlined text-ink-graphite">more_horiz</span>
            </div>

            <div
              className={`relative w-full ${item.format === "reel" ? "aspect-[9/16]" : "aspect-square"} bg-surface-container-highest overflow-hidden flex items-center justify-center`}
            >
              <MediaPreview format={item.format} mediaUrls={mediaUrls} />
            </div>

            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-4 text-ink-graphite">
                <span className="material-symbols-outlined text-[22px]">favorite</span>
                <span className="material-symbols-outlined text-[22px]">chat_bubble</span>
                <span className="material-symbols-outlined text-[22px]">send</span>
              </div>
              <span className="material-symbols-outlined text-[22px] text-ink-graphite">bookmark</span>
            </div>

            {currentVersion ? (
              <div className="px-4 pb-4 flex flex-col gap-1 text-body-md leading-snug">
                <span className="font-semibold text-primary">dein_account</span>{" "}
                <span className="text-on-surface">{currentVersion.caption}</span>
                <div className="text-ink-muted text-mono-data pt-1 leading-relaxed">
                  {currentVersion.hashtags.join(" ")}
                </div>
              </div>
            ) : null}
          </div>

          {item.status === "script_review" ? (
            <ReviewActions contentItemId={item.id} stage="script" />
          ) : item.status === "ready_for_review" ? (
            <ReviewActions contentItemId={item.id} stage="final" />
          ) : (
            <p className="text-body-md text-ink-muted text-center">
              Wartet aktuell nicht auf Review (Status: {STATUS_LABELS[item.status] ?? item.status}).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
