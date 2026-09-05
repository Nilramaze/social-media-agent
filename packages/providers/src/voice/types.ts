export interface WordTiming {
  word: string;
  startSeconds: number;
  endSeconds: number;
}

export interface VoiceSynthesisResult {
  audioBuffer: Buffer;
  wordTimings: WordTiming[];
  durationSeconds: number;
}

export interface VoiceProvider {
  synthesize(text: string): Promise<VoiceSynthesisResult>;
}
