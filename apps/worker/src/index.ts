import { Command } from "@langchain/langgraph";
import { campaigns, contentItems, db } from "@sma/db";
import { eq } from "drizzle-orm";
import {
  createContentItemsForBriefs,
  createContentItemsForCampaign,
  findCampaignsToReplenish,
  runAnalyticsCycle,
  runPlanning,
  runPublish,
  runReplenishPlanning,
} from "@sma/domain";
import {
  AnthropicLLMProvider,
  InstagramAnalyticsProvider,
  InstagramPublishProvider,
  S3StorageProvider,
} from "@sma/providers";
import {
  ANALYTICS_QUEUE_NAME,
  AUTO_REPLENISH_QUEUE_NAME,
  enqueueProductionRun,
  enqueueReplenishJob,
  getRedisConnection,
  PLANNING_QUEUE_NAME,
  planningJobSchema,
  PRODUCTION_QUEUE_NAME,
  productionJobSchema,
  PUBLISH_QUEUE_NAME,
  publishJobSchema,
  REPLENISH_QUEUE_NAME,
  replenishJobSchema,
  RESUME_GRAPH_QUEUE_NAME,
  resumeGraphJobSchema,
  scheduleAnalyticsCycle,
  scheduleAutoReplenishCheck,
} from "@sma/queue";
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

function getStorage() {
  return new S3StorageProvider({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    bucket: requireEnv("S3_BUCKET"),
    forcePathStyle: true,
  });
}

const planningWorker = new Worker(
  PLANNING_QUEUE_NAME,
  async (job) => {
    const { campaignId } = planningJobSchema.parse(job.data);
    console.log(`[worker] running planning for campaign ${campaignId}`);
    try {
      await runPlanning(campaignId, { llm });

      const contentItemIds = await createContentItemsForCampaign(campaignId);
      console.log(
        `[worker] planning done for campaign ${campaignId}, created ${contentItemIds.length} content item(s)`,
      );
      for (const contentItemId of contentItemIds) {
        await enqueueProductionRun({ contentItemId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(campaigns)
        .set({ status: "failed", planningError: message })
        .where(eq(campaigns.id, campaignId));
      throw err;
    }
  },
  { connection: getRedisConnection() },
);

const replenishWorker = new Worker(
  REPLENISH_QUEUE_NAME,
  async (job) => {
    const { campaignId, count, trigger } = replenishJobSchema.parse(job.data);
    console.log(`[worker] replenishing campaign ${campaignId} with ${count} brief(s) (${trigger})`);
    try {
      const { briefIds } = await runReplenishPlanning(campaignId, count, { llm });
      const contentItemIds = await createContentItemsForBriefs(briefIds);
      console.log(
        `[worker] replenish done for campaign ${campaignId}, created ${contentItemIds.length} content item(s)`,
      );
      for (const contentItemId of contentItemIds) {
        await enqueueProductionRun({ contentItemId });
      }
    } catch (err) {
      // Unlike initial planning, a failed top-up must not flip the campaign
      // to "failed" - its existing items keep running. Surface the error on
      // the campaign row so the UI can show it next to the controls.
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(campaigns)
        .set({ replenishError: message })
        .where(eq(campaigns.id, campaignId));
      throw err;
    }
  },
  { connection: getRedisConnection() },
);

const autoReplenishWorker = new Worker(
  AUTO_REPLENISH_QUEUE_NAME,
  async () => {
    const candidates = await findCampaignsToReplenish();
    for (const c of candidates) {
      const queued = await enqueueReplenishJob({
        campaignId: c.campaignId,
        count: c.count,
        trigger: "auto",
      });
      console.log(
        `[worker] auto-replenish: campaign ${c.campaignId} has ${c.upcoming}/${c.bufferDays} day(s) covered - ${queued ? `queued ${c.count} brief(s)` : "run already in flight"}`,
      );
    }
  },
  { connection: getRedisConnection() },
);

const productionWorker = new Worker(
  PRODUCTION_QUEUE_NAME,
  async (job) => {
    const { contentItemId } = productionJobSchema.parse(job.data);
    console.log(`[worker] running production graph for content item ${contentItemId}`);
    try {
      const graph = await getProductionGraph();
      await graph.invoke(
        { contentItemId },
        { configurable: { thread_id: contentItemId } },
      );
      console.log(`[worker] production graph done for content item ${contentItemId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(contentItems)
        .set({ status: "failed", currentStep: null, lastError: message })
        .where(eq(contentItems.id, contentItemId));
      throw err;
    }
  },
  { connection: getRedisConnection() },
);

const resumeGraphWorker = new Worker(
  RESUME_GRAPH_QUEUE_NAME,
  async (job) => {
    const { contentItemId, resumeValue } = resumeGraphJobSchema.parse(job.data);
    console.log(`[worker] resuming graph for content item ${contentItemId} with decision ${resumeValue.decision}`);
    try {
      const graph = await getProductionGraph();
      await graph.invoke(new Command({ resume: resumeValue }), {
        configurable: { thread_id: contentItemId },
      });
      console.log(`[worker] resume done for content item ${contentItemId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(contentItems)
        .set({ status: "failed", currentStep: null, lastError: message })
        .where(eq(contentItems.id, contentItemId));
      throw err;
    }
  },
  { connection: getRedisConnection() },
);

const publishWorker = new Worker(
  PUBLISH_QUEUE_NAME,
  async (job) => {
    const { contentItemId } = publishJobSchema.parse(job.data);
    console.log(`[worker] publishing content item ${contentItemId}`);
    const publish = new InstagramPublishProvider({
      igUserId: requireEnv("INSTAGRAM_USER_ID"),
      accessToken: requireEnv("INSTAGRAM_ACCESS_TOKEN"),
    });
    const result = await runPublish(contentItemId, { publish, storage: getStorage() });
    console.log(
      `[worker] publish ${result.skipped ? "skipped (already done)" : "done"} for ${contentItemId}: ${result.externalMediaId}`,
    );
  },
  { connection: getRedisConnection() },
);

const analyticsWorker = new Worker(
  ANALYTICS_QUEUE_NAME,
  async () => {
    // Without Instagram credentials there is nothing to measure - skip the
    // cycle instead of failing every repeat (e.g. before the API is set up).
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn("[worker] analytics cycle skipped: INSTAGRAM_ACCESS_TOKEN not set");
      return;
    }
    console.log("[worker] running analytics cycle");
    const analytics = new InstagramAnalyticsProvider({ accessToken });
    const result = await runAnalyticsCycle({ analytics, llm });
    console.log(
      `[worker] analytics cycle done: ${result.itemsCollected} item(s) measured, ${result.campaignsSummarized} campaign(s) summarized`,
    );
  },
  { connection: getRedisConnection() },
);

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
scheduleAnalyticsCycle(SIX_HOURS_MS).catch((err) => {
  console.error("[worker] failed to schedule analytics cycle:", err);
});

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
scheduleAutoReplenishCheck(FIFTEEN_MINUTES_MS).catch((err) => {
  console.error("[worker] failed to schedule auto-replenish check:", err);
});

planningWorker.on("failed", (job, err) => {
  console.error(`[worker] planning job ${job?.id} failed:`, err);
});
replenishWorker.on("failed", (job, err) => {
  console.error(`[worker] replenish job ${job?.id} failed:`, err);
});
autoReplenishWorker.on("failed", (job, err) => {
  console.error(`[worker] auto-replenish check ${job?.id} failed:`, err);
});
productionWorker.on("failed", (job, err) => {
  console.error(`[worker] production job ${job?.id} failed:`, err);
});
resumeGraphWorker.on("failed", (job, err) => {
  console.error(`[worker] resume-graph job ${job?.id} failed:`, err);
});
publishWorker.on("failed", (job, err) => {
  console.error(`[worker] publish job ${job?.id} failed:`, err);
});
analyticsWorker.on("failed", (job, err) => {
  console.error(`[worker] analytics job ${job?.id} failed:`, err);
});

process.on("SIGINT", async () => {
  console.log("[worker] shutting down");
  await Promise.all([
    planningWorker.close(),
    replenishWorker.close(),
    autoReplenishWorker.close(),
    productionWorker.close(),
    resumeGraphWorker.close(),
    publishWorker.close(),
    analyticsWorker.close(),
  ]);
  process.exit(0);
});
