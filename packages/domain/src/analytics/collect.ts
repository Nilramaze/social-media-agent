import {
  analyticsMetrics,
  db as defaultDb,
  publishJobs,
  type Db,
} from "@sma/db";
import type { AnalyticsProvider, MetricType } from "@sma/providers";
import { desc, eq } from "drizzle-orm";

const METRIC_TYPES: MetricType[] = [
  "views",
  "reach",
  "likes",
  "comments",
  "saves",
  "shares",
];

export interface RunAnalyticsCollectionDeps {
  analytics: AnalyticsProvider;
  db?: Db;
}

export async function runAnalyticsCollection(
  contentItemId: string,
  deps: RunAnalyticsCollectionDeps,
): Promise<{ collected: number }> {
  const db = deps.db ?? defaultDb;

  const [job] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.contentItemId, contentItemId))
    .orderBy(desc(publishJobs.publishedAt))
    .limit(1);

  if (!job || job.status !== "published" || !job.externalMediaId) {
    return { collected: 0 };
  }

  const metrics = await deps.analytics.getMetrics(job.externalMediaId, METRIC_TYPES);

  if (metrics.length > 0) {
    await db.insert(analyticsMetrics).values(
      metrics.map((metric) => ({
        workspaceId: job.workspaceId,
        contentItemId,
        platform: "instagram",
        metricType: metric.type,
        value: metric.value,
      })),
    );
  }

  return { collected: metrics.length };
}
