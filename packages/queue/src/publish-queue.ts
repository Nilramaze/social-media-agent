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
