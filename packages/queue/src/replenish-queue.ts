import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const REPLENISH_QUEUE_NAME = "replenish";

export const replenishJobSchema = z.object({
  campaignId: z.string(),
  count: z.number().int().min(1).max(20),
  trigger: z.enum(["manual", "auto"]),
});
export type ReplenishJobData = z.infer<typeof replenishJobSchema>;

let queue: Queue<ReplenishJobData> | undefined;

export function getReplenishQueue(): Queue<ReplenishJobData> {
  if (!queue) {
    queue = new Queue<ReplenishJobData>(REPLENISH_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export function replenishJobId(campaignId: string): string {
  return `replenish-${campaignId}`;
}

/** True while a replenish run for this campaign is queued or executing. */
export async function isReplenishInFlight(campaignId: string): Promise<boolean> {
  const job = await getReplenishQueue().getJob(replenishJobId(campaignId));
  if (!job) return false;
  const state = await job.getState();
  return state === "waiting" || state === "delayed" || state === "active" || state === "prioritized";
}

/**
 * One replenish run per campaign at a time: the jobId is stable and finished
 * jobs are removed (success or failure - the error lands on the campaign
 * row instead), so the next request after completion goes through again.
 * Returns false when a run is already in flight.
 */
export async function enqueueReplenishJob(data: ReplenishJobData): Promise<boolean> {
  const payload = replenishJobSchema.parse(data);
  if (await isReplenishInFlight(payload.campaignId)) return false;
  await getReplenishQueue().add(REPLENISH_QUEUE_NAME, payload, {
    jobId: replenishJobId(payload.campaignId),
    removeOnComplete: true,
    removeOnFail: true,
  });
  return true;
}

// --- Periodic auto-replenish check -----------------------------------------

export const AUTO_REPLENISH_QUEUE_NAME = "auto-replenish-check";
const AUTO_REPLENISH_SCHEDULER_ID = "auto-replenish-check-repeat";

let checkQueue: Queue | undefined;

export function getAutoReplenishQueue(): Queue {
  if (!checkQueue) {
    checkQueue = new Queue(AUTO_REPLENISH_QUEUE_NAME, { connection: getRedisConnection() });
  }
  return checkQueue;
}

/** Idempotent: upserting the same scheduler id again just updates it. */
export async function scheduleAutoReplenishCheck(everyMs: number): Promise<void> {
  await getAutoReplenishQueue().upsertJobScheduler(
    AUTO_REPLENISH_SCHEDULER_ID,
    { every: everyMs },
    { name: AUTO_REPLENISH_QUEUE_NAME, data: {} },
  );
}
