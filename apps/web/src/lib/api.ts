// Thin fetch wrapper for the app's own /api routes, used as TanStack Query
// queryFn / mutationFn. Throws on non-2xx so queries land in their error state.
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const queryKeys = {
  pipeline: ["pipeline"] as const,
  agents: ["agents"] as const,
};
