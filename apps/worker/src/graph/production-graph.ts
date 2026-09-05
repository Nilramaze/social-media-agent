import { END, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { runContent, runResearch } from "@sma/domain";
import { AnthropicLLMProvider, TavilySearchProvider } from "@sma/providers";
import { ProductionState } from "./state";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function buildProductionGraph() {
  const llm = new AnthropicLLMProvider();
  const search = new TavilySearchProvider(requireEnv("TAVILY_API_KEY"));

  return new StateGraph(ProductionState)
    .addNode("research", async (state) => {
      await runResearch(state.contentItemId, { llm, search });
      return {};
    })
    .addNode("content", async (state) => {
      await runContent(state.contentItemId, { llm });
      return {};
    })
    .addEdge(START, "research")
    .addEdge("research", "content")
    .addEdge("content", END);
}

export async function compileProductionGraph(databaseUrl: string) {
  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  await checkpointer.setup();
  return buildProductionGraph().compile({ checkpointer });
}
