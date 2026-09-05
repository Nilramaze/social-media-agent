import type { AnalyticsProvider, Metric, MetricType } from "./types";

export interface InstagramAnalyticsConfig {
  accessToken: string;
  apiVersion?: string;
}

// Reels/media insights metric names per the Instagram Graph API docs.
// Unverified against a real account - names have shifted across API
// versions in the past (e.g. "video_views" vs "plays"); re-check against
// the live docs / a real response once credentials exist.
const METRIC_NAME_MAP: Record<MetricType, string> = {
  views: "plays",
  reach: "reach",
  likes: "likes",
  comments: "comments",
  saves: "saved",
  shares: "shares",
  profile_visits: "profile_visits",
  follows: "follows",
};

interface InstagramInsightsResponse {
  data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[];
}

export class InstagramAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly config: InstagramAnalyticsConfig) {}

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.config.apiVersion ?? "v23.0"}`;
  }

  async getMetrics(
    externalMediaId: string,
    types: MetricType[],
  ): Promise<Metric[]> {
    const igMetricNames = types.map((t) => METRIC_NAME_MAP[t]);
    const params = new URLSearchParams({
      metric: igMetricNames.join(","),
      access_token: this.config.accessToken,
    });

    const res = await fetch(
      `${this.baseUrl}/${externalMediaId}/insights?${params}`,
    );
    if (!res.ok) {
      throw new Error(
        `InstagramAnalyticsProvider.getMetrics failed: ${res.status} ${await res.text()}`,
      );
    }

    const data = (await res.json()) as InstagramInsightsResponse;
    const byName = new Map(data.data.map((entry) => [entry.name, entry]));

    return types.map((type) => {
      const entry = byName.get(METRIC_NAME_MAP[type]);
      const value = entry?.total_value?.value ?? entry?.values?.[0]?.value ?? 0;
      return { type, value };
    });
  }
}
