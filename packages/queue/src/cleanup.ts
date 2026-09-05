import type { Queue } from "bullmq";
import { getPlanningQueue } from "./planning-queue";
import { getProductionQueue } from "./production-queue";
import { getPublishQueue } from "./publish-queue";
import { getResumeGraphQueue } from "./resume-graph-queue";

async function removeJobIfExists(queue: Queue, jobId: string): Promise<void> {
  const job = await queue.getJob(jobId);
  if (job) await job.remove();
}

/**
 * Best-effort cancellation: removes queued/delayed jobs for this content
 * item. A job already mid-execution when this runs can't be force-killed
 * from here - it will fail gracefully on its next DB read/write once the
 * underlying row is gone (see deleteContentItem).
 */
export async function removeContentItemJobs(contentItemId: string): Promise<void> {
  await removeJobIfExists(getProductionQueue(), `production-${contentItemId}`);
  await removeJobIfExists(getPublishQueue(), `publish-${contentItemId}`);

  const resumeQueue = getResumeGraphQueue();
  const pending = await resumeQueue.getJobs(["waiting", "delayed"]);
  for (const job of pending) {
    if (job.data.contentItemId === contentItemId) await job.remove();
  }
}

export async function removeCampaignJobs(campaignId: string): Promise<void> {
  await removeJobIfExists(getPlanningQueue(), `planning-${campaignId}`);
}
