import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const RESUME_GRAPH_QUEUE_NAME = "resume-graph";

export const resumeGraphJobSchema = z.object({
  contentItemId: z.string(),
  resumeValue: z.object({
    decision: z.enum(["approved", "changes_requested", "rejected"]),
    target: z.enum(["content", "creative"]).optional(),
    feedback: z.string().optional(),
    decidedBy: z.string(),
    // Optional so jobs queued before the script gate existed still parse.
    stage: z.enum(["script", "final"]).optional(),
  }),
});
export type ResumeGraphJobData = z.infer<typeof resumeGraphJobSchema>;

let queue: Queue<ResumeGraphJobData> | undefined;

export function getResumeGraphQueue(): Queue<ResumeGraphJobData> {
  if (!queue) {
    queue = new Queue<ResumeGraphJobData>(RESUME_GRAPH_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function enqueueResumeGraph(
  data: ResumeGraphJobData,
): Promise<void> {
  const payload = resumeGraphJobSchema.parse(data);
  await getResumeGraphQueue().add(RESUME_GRAPH_QUEUE_NAME, payload, {
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
