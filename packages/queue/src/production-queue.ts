import { Queue } from "bullmq";
import { z } from "zod";
import { getRedisConnection } from "./connection";

export const PRODUCTION_QUEUE_NAME = "production-run";

export const productionJobSchema = z.object({
  contentItemId: z.string(),
});
export type ProductionJobData = z.infer<typeof productionJobSchema>;

let queue: Queue<ProductionJobData> | undefined;

export function getProductionQueue(): Queue<ProductionJobData> {
  if (!queue) {
    queue = new Queue<ProductionJobData>(PRODUCTION_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function enqueueProductionRun(
  data: ProductionJobData,
): Promise<void> {
  const payload = productionJobSchema.parse(data);
  await getProductionQueue().add(PRODUCTION_QUEUE_NAME, payload, {
    jobId: `production-${payload.contentItemId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

/**
 * Re-runs a failed item. BullMQ dedupes `add()` by jobId and a failed job
 * with `removeOnFail: 100` sticks around, so a plain enqueue would silently
 * no-op - the old job has to be removed first. The production graph resumes
 * from its last LangGraph checkpoint (same thread_id), so already-completed
 * nodes (research/content/voice, say) don't redo their work.
 */
export async function retryProductionRun(contentItemId: string): Promise<void> {
  const queue = getProductionQueue();
  const existing = await queue.getJob(`production-${contentItemId}`);
  if (existing) await existing.remove();
  await enqueueProductionRun({ contentItemId });
}
