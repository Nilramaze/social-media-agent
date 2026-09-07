export interface Caption {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface Scene {
  imageUrl: string;
  startSeconds: number;
  endSeconds: number;
}

export type ReelProps = {
  audioUrl: string;
  captions: Caption[];
  scenes: Scene[];
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
} & Record<string, unknown>;

export type SlideProps = {
  imageUrl: string;
  text: string;
  width: number;
  height: number;
} & Record<string, unknown>;

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1080;
export const DEFAULT_HEIGHT = 1920;

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1080;

// Kept here (not in entry.tsx) so render.ts can reference them without
// importing the Remotion React composition tree - entry.tsx is only ever
// loaded by Remotion's own bundler via its file path, never by our app.
export const REEL_COMPOSITION_ID = "Reel";
export const SLIDE_COMPOSITION_ID = "Slide";
