import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contentItems,
  creativeVersions,
  db as defaultDb,
  type Db,
} from "@sma/db";
import {
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  renderReelVideo,
  type ReelProps,
} from "@sma/creative";
import type { StorageProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import type { Caption } from "./voice";

export interface VideoRenderer {
  render(props: ReelProps, outputPath: string): Promise<void>;
}

const defaultRenderer: VideoRenderer = { render: renderReelVideo };

export interface RunCreativeInput {
  audioStorageKey: string;
  captions: Caption[];
  durationSeconds: number;
}

export interface RunCreativeDeps {
  storage: StorageProvider;
  db?: Db;
  renderer?: VideoRenderer;
  /** How long the signed audio URL handed to the renderer stays valid. */
  audioUrlTtlSeconds?: number;
}

export async function runCreative(
  contentItemId: string,
  input: RunCreativeInput,
  deps: RunCreativeDeps,
): Promise<{ creativeVersionId: string }> {
  const db = deps.db ?? defaultDb;
  const renderer = deps.renderer ?? defaultRenderer;

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error(`Content item not found: ${contentItemId}`);

  const audioUrl = await deps.storage.getSignedUrl(
    input.audioStorageKey,
    deps.audioUrlTtlSeconds ?? 600,
  );

  const reelProps: ReelProps = {
    audioUrl,
    captions: input.captions,
    durationSeconds: input.durationSeconds,
    fps: DEFAULT_FPS,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };

  const tempPath = join(tmpdir(), `sma-creative-${randomUUID()}.mp4`);
  try {
    await renderer.render(reelProps, tempPath);
    const videoBuffer = await readFile(tempPath);

    const videoStorageKey = `creative/${item.id}/${randomUUID()}.mp4`;
    await deps.storage.upload(videoBuffer, videoStorageKey, "video/mp4");

    const [creativeVersion] = await db
      .insert(creativeVersions)
      .values({
        workspaceId: item.workspaceId,
        contentItemId: item.id,
        versionNumber: 1,
        remotionProps: { ...reelProps, audioUrl: undefined },
        // Stored as storage keys, not URLs: the bucket is private, so
        // consumers (dashboard, publish step) must resolve these via
        // StorageProvider.getSignedUrl() rather than fetching directly.
        assetRefs: [videoStorageKey, input.audioStorageKey],
        subtitleData: input.captions,
      })
      .returning();
    if (!creativeVersion) throw new Error("Failed to insert creative version");

    await db
      .update(contentItems)
      .set({ currentCreativeVersionId: creativeVersion.id })
      .where(eq(contentItems.id, item.id));

    return { creativeVersionId: creativeVersion.id };
  } finally {
    await rm(tempPath, { force: true });
  }
}
