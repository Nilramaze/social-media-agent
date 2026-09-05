import { END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  approvalDecisionSchema,
  recordApprovalDecision,
  runContent,
  runCreative,
  runQA,
  runResearch,
  runVoice,
  type VideoRenderer,
} from "@sma/domain";
import {
  AnthropicLLMProvider,
  ElevenLabsVoiceProvider,
  S3StorageProvider,
  TavilySearchProvider,
  type LLMProvider,
  type SearchProvider,
  type StorageProvider,
  type VoiceProvider,
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
  storage: StorageProvider;
  voice: VoiceProvider;
  renderer?: VideoRenderer;
}

export function buildProductionGraph({
  llm,
  search,
  storage,
  voice,
  renderer,
}: ProductionGraphDeps) {
  return new StateGraph(ProductionState)
    .addNode("research", async (state) => {
      await runResearch(state.contentItemId, { llm, search });
      return {};
    })
    .addNode("content", async (state) => {
      await runContent(state.contentItemId, { llm });
      return {};
    })
    .addNode("voice", async (state) => {
      const result = await runVoice(state.contentItemId, { voice, storage });
      return {
        audioStorageKey: result.audioStorageKey,
        captions: result.captions,
        voiceDurationSeconds: result.durationSeconds,
      };
    })
    .addNode("creative", async (state) => {
      if (!state.audioStorageKey || !state.captions || state.voiceDurationSeconds === undefined) {
        throw new Error("creative node reached without voice output in state");
      }
      await runCreative(
        state.contentItemId,
        {
          audioStorageKey: state.audioStorageKey,
          captions: state.captions,
          durationSeconds: state.voiceDurationSeconds,
        },
        { storage, ...(renderer !== undefined ? { renderer } : {}) },
      );
      return {};
    })
    .addNode("qa", async (state) => {
      const result = await runQA(state.contentItemId, { llm });
      return {
        qaVerdict: result.verdict,
        qaCategory: result.category,
        needsHumanReview: result.needsHumanReview,
      };
    })
    .addNode("human_approval", async (state) => {
      // interrupt() first: this node re-runs from the top on every resume,
      // so nothing before it may have side effects (see project memory).
      const resumeValue = interrupt({ contentItemId: state.contentItemId });
      const decision = approvalDecisionSchema.parse(resumeValue);
      await recordApprovalDecision(state.contentItemId, decision);
      return { approvalDecision: decision.decision, approvalTarget: decision.target };
    })
    .addEdge(START, "research")
    .addEdge("research", "content")
    .addEdge("content", "voice")
    .addEdge("voice", "creative")
    .addEdge("creative", "qa")
    .addConditionalEdges("qa", (state) => {
      if (state.qaVerdict === "pass") return "human_approval";
      if (state.needsHumanReview) return END;
      // A visual-only fail can re-render from the already-synthesized
      // voice output in state; a script fail needs a fresh script, which
      // cascades through voice -> creative again via the fixed edges above.
      return state.qaCategory === "visual" ? "creative" : "content";
    })
    .addConditionalEdges("human_approval", (state) => {
      if (state.approvalDecision !== "changes_requested") return END;
      return state.approvalTarget === "creative" ? "creative" : "content";
    });
}

export async function compileProductionGraph(databaseUrl: string) {
  const llm = new AnthropicLLMProvider();
  const search = new TavilySearchProvider(requireEnv("TAVILY_API_KEY"));
  const voice = new ElevenLabsVoiceProvider(
    requireEnv("ELEVENLABS_API_KEY"),
    requireEnv("ELEVENLABS_VOICE_ID"),
  );
  const storage = new S3StorageProvider({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    bucket: requireEnv("S3_BUCKET"),
    forcePathStyle: true,
  });
  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  await checkpointer.setup();
  return buildProductionGraph({ llm, search, storage, voice }).compile({ checkpointer });
}
