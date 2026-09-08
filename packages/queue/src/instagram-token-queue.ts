import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

export const INSTAGRAM_TOKEN_QUEUE_NAME = "instagram-token-refresh";
const SCHEDULER_ID = "instagram-token-refresh-repeat";

let queue: Queue | undefined;

export function getInstagramTokenQueue(): Queue {
  if (!queue) {
    queue = new Queue(INSTAGRAM_TOKEN_QUEUE_NAME, { connection: getRedisConnection() });
  }
  return queue;
}

/** Idempotent: upserting the same scheduler id again just updates it. */
export async function scheduleInstagramTokenRefresh(everyMs: number): Promise<void> {
  await getInstagramTokenQueue().upsertJobScheduler(
    SCHEDULER_ID,
    { every: everyMs },
    { name: INSTAGRAM_TOKEN_QUEUE_NAME, data: {} },
  );
}
