import { z } from "zod";

export const strategistOutputSchema = z.object({
  pillars: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(6),
  briefs: z
    .array(
      z.object({
        topic: z.string().min(1).max(200),
        format: z.enum(["reel", "carousel", "post"]),
        pillarName: z.string().min(1).max(80),
      }),
    )
    .min(1)
    .max(20),
});

export type StrategistOutput = z.infer<typeof strategistOutputSchema>;
