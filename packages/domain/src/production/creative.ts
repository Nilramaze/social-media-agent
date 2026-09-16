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
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  renderReelVideo,
  type ReelProps,
  type Scene,
} from "@sma/creative";
import type { ImageProvider, LLMProvider, StorageProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { NODE_MODELS } from "../model-config";
import { buildGuardrailBlock, getCampaignGuardrailsForBrief } from "./campaign-context";
import { getDesignGuidelines } from "./design-guidelines";
import { reelVisualBriefSchema } from "./schema";
import type { Caption } from "./voice";

export interface VideoRenderer {
  render(props: ReelProps, outputPath: string): Promise<void>;
}

const defaultRenderer: VideoRenderer = { render: renderReelVideo };

const VISUAL_BRIEF_SYSTEM_PROMPT = `Du bist der Visual Director einer Social-Media-Marketing-Pipeline.
Du zerlegst ein Reel-Skript in 3-5 visuelle Szenen fuer den Bildhintergrund des Videos.
Jede Szene braucht einen konkreten, bildhaften Prompt fuer eine Text-zu-Bild-KI (auf Englisch, fotorealistisch oder sauberes flaches Illustrations-Design, KEIN Text/keine Buchstaben im Bild).
Die Szenen sollen die Erzaehlung visuell begleiten: erst das Problem, dann die Loesung/das Ergebnis.
Die Motive muessen aus der Lebens- und Arbeitswelt des Kampagnen-Briefings kommen. Generische Bueromotive (Laptop, Dashboard, Meeting), die nichts mit dem Kampagnenthema zu tun haben, sind nicht erlaubt.`;

export interface RunCreativeInput {
  audioStorageKey: string;
  captions: Caption[];
  durationSeconds: number;
}

export interface RunCreativeDeps {
  llm: LLMProvider;
  image: ImageProvider;
  storage: StorageProvider;
  db?: Db;
  renderer?: VideoRenderer;
  /** How long the signed audio/image URLs handed to the renderer stay valid. */
  urlTtlSeconds?: number;
}

export async function runCreative(
  contentItemId: string,
  input: RunCreativeInput,
  deps: RunCreativeDeps,
): Promise<{ creativeVersionId: string }> {
  const db = deps.db ?? defaultDb;
  const renderer = deps.renderer ?? defaultRenderer;
  const urlTtlSeconds = deps.urlTtlSeconds ?? 600;

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

  const designGuidelines = await getDesignGuidelines(item.briefId, { db });
  const guardrails = await getCampaignGuardrailsForBrief(item.briefId, { db });
  if (!guardrails) {
    throw new Error(`No campaign for brief: ${item.briefId}`);
  }

  const visualBrief = await deps.llm.generateStructured({
    schema: reelVisualBriefSchema,
    system: VISUAL_BRIEF_SYSTEM_PROMPT,
    prompt: [
      buildGuardrailBlock(guardrails),
      `Hook: ${version.hook}`,
      `Skript: ${version.script}`,
      designGuidelines ? `\nDesign-Richtlinien der Kampagne (unbedingt einhalten):\n${designGuidelines}` : "",
      "\nZerlege dies in 3-5 visuelle Szenen gemaess Schema.",
    ]
      .filter(Boolean)
      .join("\n"),
    model: NODE_MODELS.visualBrief,
  });

  const audioUrl = await deps.storage.getSignedUrl(input.audioStorageKey, urlTtlSeconds);

  const sceneStorageKeys: string[] = [];
  const scenes: Scene[] = [];
  const sliceSeconds = input.durationSeconds / visualBrief.scenes.length;
  for (let i = 0; i < visualBrief.scenes.length; i++) {
    const sceneBrief = visualBrief.scenes[i];
    if (!sceneBrief) continue;
    const imageBuffer = await deps.image.generateImage(sceneBrief.imagePrompt, "portrait");
    const imageStorageKey = `creative/${item.id}/scene-${i}-${randomUUID()}.png`;
    await deps.storage.upload(imageBuffer, imageStorageKey, "image/png");
    sceneStorageKeys.push(imageStorageKey);
    const imageUrl = await deps.storage.getSignedUrl(imageStorageKey, urlTtlSeconds);
    scenes.push({
      imageUrl,
      startSeconds: i * sliceSeconds,
      endSeconds: (i + 1) * sliceSeconds,
    });
  }

  const reelProps: ReelProps = {
    audioUrl,
    captions: input.captions,
    scenes,
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
        remotionProps: { ...reelProps, audioUrl: undefined, scenes: undefined },
        // Stored as storage keys, not URLs: the bucket is private, so
        // consumers (dashboard, publish step) must resolve these via
        // StorageProvider.getSignedUrl() rather than fetching directly.
        assetRefs: [videoStorageKey, input.audioStorageKey, ...sceneStorageKeys],
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
