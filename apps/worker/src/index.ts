import { runPlanning } from "@sma/domain";
import { AnthropicLLMProvider } from "@sma/providers";
import {
  getRedisConnection,
  PLANNING_QUEUE_NAME,
  planningJobSchema,
} from "@sma/queue";
import { Worker } from "bullmq";

console.log("[worker] starting up...");

const llm = new AnthropicLLMProvider();

const planningWorker = new Worker(
  PLANNING_QUEUE_NAME,
  async (job) => {
    const { campaignId } = planningJobSchema.parse(job.data);
    console.log(`[worker] running planning for campaign ${campaignId}`);
    await runPlanning(campaignId, { llm });
    console.log(`[worker] planning done for campaign ${campaignId}`);
  },
  { connection: getRedisConnection() },
);

planningWorker.on("failed", (job, err) => {
  console.error(`[worker] planning job ${job?.id} failed:`, err);
});

process.on("SIGINT", async () => {
  console.log("[worker] shutting down");
  await planningWorker.close();
  process.exit(0);
});
