import { END, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { runContent, runQA, runResearch } from "@sma/domain";
import {
  AnthropicLLMProvider,
  TavilySearchProvider,
  type LLMProvider,
  type SearchProvider,
} from "@sma/providers";
import { ProductionState } from "./state";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export interface ProductionGraphDeps {
  llm: LLMProvider;
  search: SearchProvider;
}

export function buildProductionGraph({ llm, search }: ProductionGraphDeps) {
  return new StateGraph(ProductionState)
    .addNode("research", async (state) => {
      await runResearch(state.contentItemId, { llm, search });
      return {};
    })
    .addNode("content", async (state) => {
      await runContent(state.contentItemId, { llm });
      return {};
    })
    .addNode("qa", async (state) => {
      const result = await runQA(state.contentItemId, { llm });
      return {
        qaVerdict: result.verdict,
        needsHumanReview: result.needsHumanReview,
      };
    })
    .addEdge(START, "research")
    .addEdge("research", "content")
    .addEdge("content", "qa")
    .addConditionalEdges("qa", (state) =>
      state.qaVerdict === "fail" && !state.needsHumanReview ? "content" : END,
    );
}

export async function compileProductionGraph(databaseUrl: string) {
  const llm = new AnthropicLLMProvider();
  const search = new TavilySearchProvider(requireEnv("TAVILY_API_KEY"));
  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  await checkpointer.setup();
  return buildProductionGraph({ llm, search }).compile({ checkpointer });
}
