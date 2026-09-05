import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceProvider, VoiceSynthesisResult, WordTiming } from "../voice/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

// A real (silent) MP3 so this fake can be used in real-render integration
// tests, not just DB-level unit tests - a placeholder text buffer isn't
// valid audio and fails ffprobe/Remotion's audio processing.
const SILENT_MP3 = readFileSync(join(__dirname, "fixtures", "silent.mp3"));

/**
 * Test double for VoiceProvider - synthesizes deterministic fake word
 * timings (0.3s per word) and returns a real (silent) MP3 buffer instead of
 * calling a real TTS API.
 */
export class FakeVoiceProvider implements VoiceProvider {
  public readonly calls: string[] = [];

  async synthesize(text: string): Promise<VoiceSynthesisResult> {
    this.calls.push(text);
    const wordsPerSecond = 1 / 0.3;
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    const wordTimings: WordTiming[] = words.map((word, i) => ({
      word,
      startSeconds: i / wordsPerSecond,
      endSeconds: (i + 1) / wordsPerSecond,
    }));

    const durationSeconds = wordTimings.length > 0
      ? (wordTimings[wordTimings.length - 1]?.endSeconds ?? 0)
      : 0;

    return {
      audioBuffer: SILENT_MP3,
      wordTimings,
      durationSeconds,
    };
  }
}
