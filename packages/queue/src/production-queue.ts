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
