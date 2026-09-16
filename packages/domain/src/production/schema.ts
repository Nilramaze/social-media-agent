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
  // Hard cap: a 30-60s Reel script is ~100-150 words. Without a ceiling the
  // model happily writes multi-page scripts, which blow past max_tokens and
  // truncate the JSON mid-string.
  script: z.string().min(1).max(2000),
  caption: z.string().min(1).max(2200),
  cta: z.string().min(1).max(200),
  hashtags: z.array(z.string().min(1).max(50)).min(3).max(30),
});
export type ContentOutput = z.infer<typeof contentOutputSchema>;

export const qaJudgeOutputSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  // Set when the content leaves the campaign's briefing (foreign topic,
  // foreign industry, or an analogy that bridges to one). Tracked separately
  // from `verdict` so the retry gets told it drifted rather than just
  // "schwacher Hook" - and so scope drift is visible in qa_results.
  scopeViolation: z.boolean(),
  feedback: z.string().min(1),
});
export type QaJudgeOutput = z.infer<typeof qaJudgeOutputSchema>;

export const reelVisualBriefSchema = z.object({
  scenes: z
    .array(
      z.object({
        imagePrompt: z.string().min(1).max(500),
      }),
    )
    .min(3)
    .max(5),
});
export type ReelVisualBrief = z.infer<typeof reelVisualBriefSchema>;

export const staticSlidesBriefSchema = z.object({
  slides: z
    .array(
      z.object({
        text: z.string().min(1).max(120),
        imagePrompt: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(6),
});
export type StaticSlidesBrief = z.infer<typeof staticSlidesBriefSchema>;
