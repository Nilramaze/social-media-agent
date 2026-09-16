import { randomUUID } from "node:crypto";
import {
  contentItems,
  contentVersions,
  creativeVersions,
  db as defaultDb,
  type Db,
} from "@sma/db";
import { renderStillImage, SLIDE_HEIGHT, SLIDE_WIDTH, type SlideProps } from "@sma/creative";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { ImageProvider, LLMProvider, StorageProvider } from "@sma/providers";
import { eq } from "drizzle-orm";
import { NODE_MODELS } from "../model-config";
import { buildGuardrailBlock, getCampaignGuardrailsForBrief } from "./campaign-context";
import { getDesignGuidelines } from "./design-guidelines";
import { staticSlidesBriefSchema } from "./schema";

export interface StaticSlideRenderer {
  render(props: SlideProps, outputPath: string): Promise<void>;
}

const defaultRenderer: StaticSlideRenderer = { render: renderStillImage };

const STATIC_BRIEF_SYSTEM_PROMPT = `Du bist der Visual Director einer Social-Media-Marketing-Pipeline.
Slide-Texte und Bildmotive muessen aus der Lebens- und Arbeitswelt des Kampagnen-Briefings kommen; generische Bueromotive ohne Bezug zum Kampagnenthema sind nicht erlaubt.
Du zerlegst einen Post/Carousel-Text in einzelne Bild-Slides.
Fuer "post" erzeugst du GENAU 1 Slide. Fuer "carousel" erzeugst du 4-6 Slides, die die Story in logischen Schritten erzaehlen (z.B. Problem -> Loesung -> Ergebnis -> CTA).
Jeder Slide braucht: einen kurzen Text (max. 120 Zeichen, der als Overlay auf dem Bild angezeigt wird) und einen bildhaften Prompt fuer eine Text-zu-Bild-KI (auf Englisch, fotorealistisch oder sauberes flaches Illustrations-Design, KEIN Text/keine Buchstaben im Bild selbst, der Text kommt als separates Overlay).`;

export interface RunCreativeStaticInput {
  format: "carousel" | "post";
}

export interface RunCreativeStaticDeps {
  llm: LLMProvider;
  image: ImageProvider;
  storage: StorageProvider;
  db?: Db;
  renderer?: StaticSlideRenderer;
}

export async function runCreativeStatic(
  contentItemId: string,
  input: RunCreativeStaticInput,
  deps: RunCreativeStaticDeps,
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

  const slideCountInstruction =
    input.format === "post"
      ? "Erzeuge genau 1 Slide."
      : "Erzeuge 4-6 Slides fuer ein Carousel.";

  const designGuidelines = await getDesignGuidelines(item.briefId, { db });
  const guardrails = await getCampaignGuardrailsForBrief(item.briefId, { db });
  if (!guardrails) {
    throw new Error(`No campaign for brief: ${item.briefId}`);
  }

  const brief = await deps.llm.generateStructured({
    schema: staticSlidesBriefSchema,
    system: STATIC_BRIEF_SYSTEM_PROMPT,
    prompt: [
      buildGuardrailBlock(guardrails),
      `Format: ${input.format}`,
      `Hook: ${version.hook}`,
      `Skript: ${version.script}`,
      `Caption: ${version.caption}`,
      `CTA: ${version.cta}`,
      designGuidelines ? `\nDesign-Richtlinien der Kampagne (unbedingt einhalten):\n${designGuidelines}` : "",
      `\n${slideCountInstruction}`,
    ]
      .filter(Boolean)
      .join("\n"),
    model: NODE_MODELS.visualBrief,
  });

  const slideStorageKeys: string[] = [];

  for (let i = 0; i < brief.slides.length; i++) {
    const slide = brief.slides[i];
    if (!slide) continue;

    const imageBuffer = await deps.image.generateImage(slide.imagePrompt, "square");

    const slideProps: SlideProps = {
      imageUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
      text: slide.text,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    };

    const tempPath = join(tmpdir(), `sma-slide-${randomUUID()}.png`);
    try {
      await renderer.render(slideProps, tempPath);
      const renderedBuffer = await readFile(tempPath);

      const slideStorageKey = `creative/${item.id}/slide-${i}-${randomUUID()}.png`;
      await deps.storage.upload(renderedBuffer, slideStorageKey, "image/png");
      slideStorageKeys.push(slideStorageKey);
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  const [creativeVersion] = await db
    .insert(creativeVersions)
    .values({
      workspaceId: item.workspaceId,
      contentItemId: item.id,
      versionNumber: 1,
      remotionProps: { slides: brief.slides },
      // Stored as storage keys, not URLs: consumers resolve these via
      // StorageProvider.getSignedUrl() since the bucket is private.
      assetRefs: slideStorageKeys,
      subtitleData: null,
    })
    .returning();
  if (!creativeVersion) throw new Error("Failed to insert creative version");

  await db
    .update(contentItems)
    .set({ currentCreativeVersionId: creativeVersion.id })
    .where(eq(contentItems.id, item.id));

  return { creativeVersionId: creativeVersion.id };
}
