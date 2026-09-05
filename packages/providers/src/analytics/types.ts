export type MetricType =
  | "views"
  | "reach"
  | "likes"
  | "comments"
  | "saves"
  | "shares"
  | "profile_visits"
  | "follows";

export interface Metric {
  type: MetricType;
  value: number;
}

export interface AnalyticsProvider {
  getMetrics(externalMediaId: string, types: MetricType[]): Promise<Metric[]>;
}
