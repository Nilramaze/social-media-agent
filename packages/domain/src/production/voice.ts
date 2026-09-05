import { randomUUID } from "node:crypto";
import {
  contentItems,
  contentVersions,
  db as defaultDb,
  type Db,
} from "@sma/db";
import type { StorageProvider, VoiceProvider, WordTiming } from "@sma/providers";
import { eq } from "drizzle-orm";

export interface Caption {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

const WORDS_PER_CAPTION = 5;

function groupWordsIntoCaptions(words: WordTiming[], wordsPerCaption: number): Caption[] {
  const captions: Caption[] = [];
  for (let i = 0; i < words.length; i += wordsPerCaption) {
    const slice = words.slice(i, i + wordsPerCaption);
    const first = slice[0];
    const last = slice[slice.length - 1];
    if (!first || !last) continue;
    captions.push({
      text: slice.map((w) => w.word).join(" "),
      startSeconds: first.startSeconds,
      endSeconds: last.endSeconds,
    });
  }
  return captions;
}

export interface RunVoiceDeps {
  voice: VoiceProvider;
  storage: StorageProvider;
  db?: Db;
}

export interface RunVoiceResult {
  audioStorageKey: string;
  captions: Caption[];
  durationSeconds: number;
}

export async function runVoice(
  contentItemId: string,
  deps: RunVoiceDeps,
): Promise<RunVoiceResult> {
  const db = deps.db ?? defaultDb;

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

  const { audioBuffer, wordTimings, durationSeconds } = await deps.voice.synthesize(
    version.script,
  );

  const audioStorageKey = `voice/${item.id}/${randomUUID()}.mp3`;
  await deps.storage.upload(audioBuffer, audioStorageKey, "audio/mpeg");

  const captions = groupWordsIntoCaptions(wordTimings, WORDS_PER_CAPTION);

  return { audioStorageKey, captions, durationSeconds };
}
