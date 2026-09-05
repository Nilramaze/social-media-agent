import { z } from "zod";

export const sceneSchema = z.object({
  text: z.string().min(1).max(120),
  durationSeconds: z.number().min(1).max(15),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type Scene = z.infer<typeof sceneSchema>;

export const creativeBriefSchema = z.object({
  scenes: z.array(sceneSchema).min(3).max(10),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

export type ReelProps = {
  scenes: Scene[];
  fps: number;
  width: number;
  height: number;
} & Record<string, unknown>;

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1080;
export const DEFAULT_HEIGHT = 1920;
