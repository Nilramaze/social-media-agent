import type { AnalyticsProvider, Metric, MetricType } from "./types";

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededValue(seed: number, salt: number, max: number): number {
  const x = Math.sin(seed + salt) * 10000;
  return Math.floor((x - Math.floor(x)) * max);
}

const RANGES: Record<MetricType, number> = {
  views: 5000,
  reach: 4000,
  likes: 400,
  comments: 40,
  saves: 100,
  shares: 60,
  profile_visits: 150,
  follows: 20,
};

export class MockAnalyticsProvider implements AnalyticsProvider {
  async getMetrics(
    externalMediaId: string,
    types: MetricType[],
  ): Promise<Metric[]> {
    const seed = hashSeed(externalMediaId);
    return types.map((type, i) => ({
      type,
      value: seededValue(seed, i, RANGES[type]),
    }));
  }
}
