import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

export const ANALYTICS_QUEUE_NAME = "analytics-cycle";
const REPEATABLE_JOB_ID = "analytics-cycle-repeat";

let queue: Queue | undefined;

export function getAnalyticsQueue(): Queue {
  if (!queue) {
    queue = new Queue(ANALYTICS_QUEUE_NAME, { connection: getRedisConnection() });
  }
  return queue;
}

/** Idempotent: upserting the same scheduler id again just updates it. */
export async function scheduleAnalyticsCycle(everyMs: number): Promise<void> {
  await getAnalyticsQueue().upsertJobScheduler(REPEATABLE_JOB_ID, { every: everyMs }, {
    name: ANALYTICS_QUEUE_NAME,
    data: {},
  });
}
