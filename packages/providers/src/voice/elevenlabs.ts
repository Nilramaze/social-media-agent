import type { VoiceProvider, VoiceSynthesisResult, WordTiming } from "./types";

interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface ElevenLabsResponse {
  audio_base64: string;
  alignment: ElevenLabsAlignment;
}

function alignmentToWordTimings(alignment: ElevenLabsAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  let current = "";
  let start: number | null = null;
  let end = 0;

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i];
    const charStart = alignment.character_start_times_seconds[i];
    const charEnd = alignment.character_end_times_seconds[i];

    if (char === undefined || charStart === undefined || charEnd === undefined) {
      continue;
    }

    if (char === " " || char === "\n") {
      if (current.length > 0 && start !== null) {
        words.push({ word: current, startSeconds: start, endSeconds: end });
      }
      current = "";
      start = null;
      continue;
    }

    if (start === null) start = charStart;
    end = charEnd;
    current += char;
  }

  if (current.length > 0 && start !== null) {
    words.push({ word: current, startSeconds: start, endSeconds: end });
  }

  return words;
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  constructor(
    private readonly apiKey: string,
    private readonly voiceId: string,
    private readonly modelId = "eleven_multilingual_v2",
  ) {}

  async synthesize(text: string): Promise<VoiceSynthesisResult> {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, model_id: this.modelId }),
      },
    );

    if (!res.ok) {
      throw new Error(
        `ElevenLabs text-to-speech failed: ${res.status} ${await res.text()}`,
      );
    }

    const data = (await res.json()) as ElevenLabsResponse;
    const audioBuffer = Buffer.from(data.audio_base64, "base64");
    const wordTimings = alignmentToWordTimings(data.alignment);
    const durationSeconds =
      wordTimings.length > 0
        ? (wordTimings[wordTimings.length - 1]?.endSeconds ?? 0)
        : 0;

    return { audioBuffer, wordTimings, durationSeconds };
  }
}
