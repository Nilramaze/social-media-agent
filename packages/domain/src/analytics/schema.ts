import { z } from "zod";

export const learningsOutputSchema = z.object({
  insightText: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
});
export type LearningsOutput = z.infer<typeof learningsOutputSchema>;
