import { z } from "zod";

export const researchOutputSchema = z.object({
  summary: z.string().min(1),
  sources: z
    .array(z.object({ title: z.string().min(1), url: z.string().min(1) }))
    .min(1)
    .max(8),
});
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export const contentOutputSchema = z.object({
  hook: z.string().min(1).max(200),
  script: z.string().min(1),
  caption: z.string().min(1).max(2200),
  cta: z.string().min(1).max(200),
  hashtags: z.array(z.string().min(1).max(50)).min(3).max(30),
});
export type ContentOutput = z.infer<typeof contentOutputSchema>;

export const qaJudgeOutputSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  feedback: z.string().min(1),
});
export type QaJudgeOutput = z.infer<typeof qaJudgeOutputSchema>;
