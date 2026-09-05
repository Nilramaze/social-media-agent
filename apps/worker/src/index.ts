import { createContentItemsForCampaign, runPlanning } from "@sma/domain";
import { AnthropicLLMProvider } from "@sma/providers";
import {
  enqueueProductionRun,
  getRedisConnection,
  PLANNING_QUEUE_NAME,
  planningJobSchema,
  PRODUCTION_QUEUE_NAME,
  productionJobSchema,
  RESUME_GRAPH_QUEUE_NAME,
  resumeGraphJobSchema,
} from "@sma/queue";
import { Command } from "@langchain/langgraph";
import { Worker } from "bullmq";
import { compileProductionGraph } from "./graph/production-graph";

console.log("[worker] starting up...");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const llm = new AnthropicLLMProvider();

let productionGraphPromise: ReturnType<typeof compileProductionGraph> | undefined;
function getProductionGraph() {
  if (!productionGraphPromise) {
    productionGraphPromise = compileProductionGraph(requireEnv("DATABASE_URL"));
  }
  return productionGraphPromise;
}

const planningWorker = new Worker(
  PLANNING_QUEUE_NAME,
  async (job) => {
    const { campaignId } = planningJobSchema.parse(job.data);
    console.log(`[worker] running planning for campaign ${campaignId}`);
    await runPlanning(campaignId, { llm });

    const contentItemIds = await createContentItemsForCampaign(campaignId);
    console.log(
      `[worker] planning done for campaign ${campaignId}, created ${contentItemIds.length} content item(s)`,
    );
    for (const contentItemId of contentItemIds) {
      await enqueueProductionRun({ contentItemId });
    }
  },
  { connection: getRedisConnection() },
);

const productionWorker = new Worker(
  PRODUCTION_QUEUE_NAME,
  async (job) => {
    const { contentItemId } = productionJobSchema.parse(job.data);
    console.log(`[worker] running production graph for content item ${contentItemId}`);
    const graph = await getProductionGraph();
    await graph.invoke(
      { contentItemId },
      { configurable: { thread_id: contentItemId } },
    );
    console.log(`[worker] production graph done for content item ${contentItemId}`);
  },
  { connection: getRedisConnection() },
);

const resumeGraphWorker = new Worker(
  RESUME_GRAPH_QUEUE_NAME,
  async (job) => {
    const { contentItemId, resumeValue } = resumeGraphJobSchema.parse(job.data);
    console.log(`[worker] resuming graph for content item ${contentItemId} with decision ${resumeValue.decision}`);
    const graph = await getProductionGraph();
    await graph.invoke(new Command({ resume: resumeValue }), {
      configurable: { thread_id: contentItemId },
    });
    console.log(`[worker] resume done for content item ${contentItemId}`);
  },
  { connection: getRedisConnection() },
);

planningWorker.on("failed", (job, err) => {
  console.error(`[worker] planning job ${job?.id} failed:`, err);
});
productionWorker.on("failed", (job, err) => {
  console.error(`[worker] production job ${job?.id} failed:`, err);
});
resumeGraphWorker.on("failed", (job, err) => {
  console.error(`[worker] resume-graph job ${job?.id} failed:`, err);
});

process.on("SIGINT", async () => {
  console.log("[worker] shutting down");
  await Promise.all([
    planningWorker.close(),
    productionWorker.close(),
    resumeGraphWorker.close(),
  ]);
  process.exit(0);
});
