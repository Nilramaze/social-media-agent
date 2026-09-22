import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const PLANNING_QUEUE_NAME = "planning";

export const planningJobSchema = z.object({
  campaignId: z.string(),
  /** Reviewer feedback when a rejected plan is planned again. */
  feedback: z.string().max(5_000).optional(),
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

/**
 * "Neu planen": the first planning job may still sit in the queue (a failed
 * one is kept, see removeOnFail), and BullMQ dedupes by jobId - so it has
 * to be removed before the new run can be added.
 */
export async function requeuePlanningJob(data: PlanningJobData): Promise<void> {
  const existing = await getPlanningQueue().getJob(`planning-${data.campaignId}`);
  if (existing) await existing.remove();
  await enqueuePlanningJob(data);
}
