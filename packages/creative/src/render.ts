import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { REEL_COMPOSITION_ID, SLIDE_COMPOSITION_ID } from "./entry";
import type { ReelProps, SlideProps } from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

let bundleLocationPromise: Promise<string> | undefined;

function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    bundleLocationPromise = bundle({
      entryPoint: join(__dirname, "entry.tsx"),
    });
  }
  return bundleLocationPromise;
}

export async function renderReelVideo(
  props: ReelProps,
  outputPath: string,
): Promise<void> {
  const serveUrl = await getBundleLocation();

  const composition = await selectComposition({
    serveUrl,
    id: REEL_COMPOSITION_ID,
    inputProps: props,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props,
  });
}

export async function renderStillImage(
  props: SlideProps,
  outputPath: string,
): Promise<void> {
  const serveUrl = await getBundleLocation();

  const composition = await selectComposition({
    serveUrl,
    id: SLIDE_COMPOSITION_ID,
    inputProps: props,
  });

  await renderStill({
    composition,
    serveUrl,
    output: outputPath,
    inputProps: props,
  });
}
