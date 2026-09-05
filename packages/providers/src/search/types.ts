export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}
