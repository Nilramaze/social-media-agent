import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const PUBLISH_QUEUE_NAME = "publish";

export const publishJobSchema = z.object({
  contentItemId: z.string(),
});
export type PublishJobData = z.infer<typeof publishJobSchema>;

let queue: Queue<PublishJobData> | undefined;

export function getPublishQueue(): Queue<PublishJobData> {
  if (!queue) {
    queue = new Queue<PublishJobData>(PUBLISH_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function enqueuePublish(
  data: PublishJobData,
  delayMs = 0,
): Promise<void> {
  const payload = publishJobSchema.parse(data);
  await getPublishQueue().add(PUBLISH_QUEUE_NAME, payload, {
    jobId: `publish-${payload.contentItemId}`,
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

/**
 * Re-times an already-scheduled publish job (e.g. the item was dragged to a
 * new day on the calendar). BullMQ dedupes `add()` by jobId and silently
 * keeps the existing job's delay, so the pending delayed job has to be
 * removed first. A no-op if the job is already running/done - that item
 * missed the reschedule window and publishes as originally scheduled.
 */
export async function reschedulePublish(
  contentItemId: string,
  delayMs: number,
): Promise<void> {
  const queue = getPublishQueue();
  const existing = await queue.getJob(`publish-${contentItemId}`);
  if (existing) {
    const state = await existing.getState();
    if (state !== "delayed" && state !== "waiting") return;
    await existing.remove();
  }
  await enqueuePublish({ contentItemId }, delayMs);
}
