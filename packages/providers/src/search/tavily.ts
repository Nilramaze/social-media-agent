import type { SearchProvider, SearchResult } from "./types";

interface TavilyResponse {
  results: { title: string; url: string; content: string }[];
}

export class TavilySearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly maxResults = 5,
  ) {}

  async search(query: string): Promise<SearchResult[]> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: this.maxResults,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily search failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as TavilyResponse;
    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }));
  }
}
