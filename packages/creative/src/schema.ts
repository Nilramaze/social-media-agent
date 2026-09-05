export interface Caption {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export type ReelProps = {
  audioUrl: string;
  captions: Caption[];
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
} & Record<string, unknown>;

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1080;
export const DEFAULT_HEIGHT = 1920;

export const BACKGROUND_COLORS = ["#111111", "#1e3a8a", "#065f46"];
