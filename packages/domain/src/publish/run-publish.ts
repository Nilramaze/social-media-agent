import {
  contentItems,
  contentVersions,
  creativeVersions,
  db as defaultDb,
  publishJobs,
  type Db,
} from "@sma/db";
import type { ContainerStatus, PublishProvider, StorageProvider } from "@sma/providers";
import { eq } from "drizzle-orm";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RunPublishDeps {
  publish: PublishProvider;
  storage: StorageProvider;
  db?: Db;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunPublishResult {
  externalMediaId: string;
  skipped: boolean;
}

export async function runPublish(
  contentItemId: string,
  deps: RunPublishDeps,
): Promise<RunPublishResult> {
  const db = deps.db ?? defaultDb;
  const sleep = deps.sleep ?? defaultSleep;
  const pollIntervalMs = deps.pollIntervalMs ?? 10_000;
  const maxPollAttempts = deps.maxPollAttempts ?? 30;

  const idempotencyKey = `publish-${contentItemId}`;

  const [existingJob] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existingJob?.status === "published" && existingJob.externalMediaId) {
    return { externalMediaId: existingJob.externalMediaId, skipped: true };
  }

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);
  if (!item.currentContentVersionId || !item.currentCreativeVersionId) {
    throw new Error(`Content item is missing a content or creative version: ${contentItemId}`);
  }

  const [contentVersion] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.id, item.currentContentVersionId))
    .limit(1);
  if (!contentVersion) throw new Error(`Content version not found: ${item.currentContentVersionId}`);

  const [creativeVersion] = await db
    .select()
    .from(creativeVersions)
    .where(eq(creativeVersions.id, item.currentCreativeVersionId))
    .limit(1);
  if (!creativeVersion) throw new Error(`Creative version not found: ${item.currentCreativeVersionId}`);

  const videoStorageKey = creativeVersion.assetRefs[0];
  if (!videoStorageKey) {
    throw new Error(`Creative version has no video asset: ${creativeVersion.id}`);
  }

  const job =
    existingJob ??
    (
      await db
        .insert(publishJobs)
        .values({
          workspaceId: item.workspaceId,
          contentItemId: item.id,
          scheduledAt: new Date(),
          idempotencyKey,
          status: "publishing",
        })
        .returning()
    )[0];
  if (!job) throw new Error("Failed to create or find publish job");

  if (existingJob) {
    await db
      .update(publishJobs)
      .set({ status: "publishing", error: null })
      .where(eq(publishJobs.id, job.id));
  }

  try {
    const videoUrl = await deps.storage.getSignedUrl(videoStorageKey, 3600);
    const caption = `${contentVersion.caption}\n\n${contentVersion.hashtags.join(" ")}`;

    const { containerId } = await deps.publish.createContainer(videoUrl, {
      caption,
      format: item.format,
    });

    let status: ContainerStatus = "in_progress";
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      status = await deps.publish.getContainerStatus(containerId);
      if (status !== "in_progress") break;
      await sleep(pollIntervalMs);
    }
    if (status !== "finished") {
      throw new Error(`Publish container did not finish processing (status: ${status})`);
    }

    const { externalMediaId } = await deps.publish.publish(containerId, idempotencyKey);

    await db
      .update(publishJobs)
      .set({ status: "published", externalMediaId, publishedAt: new Date() })
      .where(eq(publishJobs.id, job.id));
    await db
      .update(contentItems)
      .set({ status: "published" })
      .where(eq(contentItems.id, item.id));

    return { externalMediaId, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(publishJobs)
      .set({ status: "failed", error: message })
      .where(eq(publishJobs.id, job.id));
    await db
      .update(contentItems)
      .set({ status: "failed" })
      .where(eq(contentItems.id, item.id));
    throw err;
  }
}
