import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const PLANNING_QUEUE_NAME = "planning";

export const planningJobSchema = z.object({
  campaignId: z.string(),
});
export type PlanningJobData = z.infer<typeof planningJobSchema>;

let queue: Queue<PlanningJobData> | undefined;

export function getPlanningQueue(): Queue<PlanningJobData> {
  if (!queue) {
    queue = new Queue<PlanningJobData>(PLANNING_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function enqueuePlanningJob(data: PlanningJobData): Promise<void> {
  const payload = planningJobSchema.parse(data);
  await getPlanningQueue().add(PLANNING_QUEUE_NAME, payload, {
    jobId: `planning-${payload.campaignId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
