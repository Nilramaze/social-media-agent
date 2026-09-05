import { END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  approvalDecisionSchema,
  recordApprovalDecision,
  runContent,
  runQA,
  runResearch,
} from "@sma/domain";
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
    .addNode("human_approval", async (state) => {
      // interrupt() first: this node re-runs from the top on every resume,
      // so nothing before it may have side effects (see project memory).
      const resumeValue = interrupt({ contentItemId: state.contentItemId });
      const decision = approvalDecisionSchema.parse(resumeValue);
      await recordApprovalDecision(state.contentItemId, decision);
      return { approvalDecision: decision.decision };
    })
    .addEdge(START, "research")
    .addEdge("research", "content")
    .addEdge("content", "qa")
    .addConditionalEdges("qa", (state) => {
      if (state.qaVerdict === "pass") return "human_approval";
      if (state.needsHumanReview) return END;
      return "content";
    })
    .addConditionalEdges("human_approval", (state) =>
      state.approvalDecision === "changes_requested" ? "content" : END,
    );
}

export async function compileProductionGraph(databaseUrl: string) {
  const llm = new AnthropicLLMProvider();
  const search = new TavilySearchProvider(requireEnv("TAVILY_API_KEY"));
  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  await checkpointer.setup();
  return buildProductionGraph({ llm, search }).compile({ checkpointer });
}
