import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contentItems,
  contentVersions,
  creativeVersions,
  db as defaultDb,
  type Db,
} from "@sma/db";
import {
  creativeBriefSchema,
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  renderReelVideo,
  type ReelProps,
} from "@sma/creative";
import type { LLMProvider, StorageProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { NODE_MODELS } from "../model-config";

const CREATIVE_SYSTEM_PROMPT = `Du bist der Creative Agent einer Social-Media-Marketing-Pipeline fuer eine kleine KI-/Web-Agentur.
Du zerlegst ein bereits geschriebenes Reel-Skript in 3-10 kurze Bildschirmtext-Szenen fuer ein vertikales Video (Text-auf-Hintergrund-Stil).
Jede Szene: ein kurzer, gut lesbarer Text (max. ca. 15 Woerter), eine Dauer in Sekunden (1-15) und eine Hintergrundfarbe als Hex-Code, die farblich zur Aussage passt (z.B. dunkel/ernst fuer das Problem, kraeftig/positiv fuer die Loesung).`;

export interface VideoRenderer {
  render(props: ReelProps, outputPath: string): Promise<void>;
}

const defaultRenderer: VideoRenderer = { render: renderReelVideo };

export interface RunCreativeDeps {
  llm: LLMProvider;
  storage: StorageProvider;
  db?: Db;
  renderer?: VideoRenderer;
}

export async function runCreative(
  contentItemId: string,
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
  if (!item.currentContentVersionId) {
    throw new Error(`Content item has no current content version: ${contentItemId}`);
  }

  const [version] = await db
    .select()
    .from(contentVersions)
    .where(eq(contentVersions.id, item.currentContentVersionId))
    .limit(1);
  if (!version) {
    throw new Error(`Content version not found: ${item.currentContentVersionId}`);
  }

  const prompt = `Hook: ${version.hook}
Skript: ${version.script}
CTA: ${version.cta}

Zerlege diesen Content in Bildschirmtext-Szenen gemaess Schema.`;

  const brief = await deps.llm.generateStructured({
    schema: creativeBriefSchema,
    system: CREATIVE_SYSTEM_PROMPT,
    prompt,
    model: NODE_MODELS.creative,
  });

  const reelProps: ReelProps = {
    scenes: brief.scenes,
    fps: DEFAULT_FPS,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };

  const tempPath = join(tmpdir(), `sma-creative-${randomUUID()}.mp4`);
  try {
    await renderer.render(reelProps, tempPath);
    const videoBuffer = await readFile(tempPath);

    const storageKey = `creative/${item.id}/${randomUUID()}.mp4`;
    await deps.storage.upload(videoBuffer, storageKey, "video/mp4");

    const [creativeVersion] = await db
      .insert(creativeVersions)
      .values({
        workspaceId: item.workspaceId,
        contentItemId: item.id,
        versionNumber: 1,
        remotionProps: reelProps,
        // Stored as a storage key, not a URL: the bucket is private, so
        // consumers (dashboard, publish step) must resolve this via
        // StorageProvider.getSignedUrl() rather than fetching it directly.
        assetRefs: [storageKey],
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
