import { END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  approvalDecisionSchema,
  assignScheduledSlot,
  getContentItemFormat,
  getContentItemSchedule,
  markContentItemScheduled,
  markContentItemStep,
  recordApprovalDecision,
  reopenReview,
  runContent,
  runCreative,
  runCreativeStatic,
  runQA,
  runResearch,
  runVoice,
  type ApprovalDecisionInput,
  type ApprovalStage,
  type StaticSlideRenderer,
  type VideoRenderer,
} from "@sma/domain";
import {
  AnthropicLLMProvider,
  ElevenLabsVoiceProvider,
  OpenAIImageProvider,
  S3StorageProvider,
  TavilySearchProvider,
  type ImageProvider,
  type LLMProvider,
  type SearchProvider,
  type StorageProvider,
  type VoiceProvider,
} from "@sma/providers";
import { enqueuePublish } from "@sma/queue";
import { ProductionState } from "./state";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/**
 * Pauses the graph until a reviewer decides at the given gate.
 *
 * interrupt() comes first: the calling node re-runs from the top on every
 * resume, so nothing before it may have side effects (see project memory).
 * Both gates resume the same thread, so a decision meant for the other one
 * (e.g. a duplicate script approval reaching the final media review) is
 * dropped and the item goes back into this gate's queue. Throwing instead
 * would wedge the thread: LangGraph replays the stored resume value on every
 * later resume.
 */
async function awaitReviewDecision(
  contentItemId: string,
  stage: ApprovalStage,
): Promise<ApprovalDecisionInput> {
  for (;;) {
    const decision = approvalDecisionSchema.parse(interrupt({ contentItemId, stage }));
    if (!decision.stage || decision.stage === stage) return decision;
    console.warn(
      `[worker] dropped a ${decision.stage}-review decision that reached the ${stage} review of ${contentItemId}`,
    );
    // Idempotent, so safe to repeat when the node replays.
    await reopenReview(contentItemId, stage);
  }
}

export interface ProductionGraphDeps {
  llm: LLMProvider;
  search: SearchProvider;
  storage: StorageProvider;
  voice: VoiceProvider;
  image: ImageProvider;
  renderer?: VideoRenderer;
  staticRenderer?: StaticSlideRenderer;
  /** Defaults to the real publish queue, delayed until the item's calendar slot; override in tests to avoid touching Redis. */
  onApproved?: (contentItemId: string, delayMs: number) => Promise<void>;
}

export function buildProductionGraph({
  llm,
  search,
  storage,
  voice,
  image,
  renderer,
  staticRenderer,
  onApproved = (contentItemId, delayMs) => enqueuePublish({ contentItemId }, delayMs),
}: ProductionGraphDeps) {
  async function resolveCreativeNode(contentItemId: string): Promise<"creative" | "creative_static"> {
    const format = await getContentItemFormat(contentItemId);
    return format === "reel" ? "creative" : "creative_static";
  }
  return new StateGraph(ProductionState)
    .addNode("research", async (state) => {
      await markContentItemStep(state.contentItemId, "research");
      await runResearch(state.contentItemId, { llm, search });
      return {};
    })
    .addNode("content", async (state) => {
      await markContentItemStep(state.contentItemId, "content");
      await runContent(state.contentItemId, { llm });
      // Pausing for the script review next - no agent works on it meanwhile.
      await markContentItemStep(state.contentItemId, null);
      return {};
    })
    .addNode("script_review", async (state) => {
      const decision = await awaitReviewDecision(state.contentItemId, "script");
      await recordApprovalDecision(state.contentItemId, "script", decision);
      return { scriptDecision: decision.decision };
    })
    .addNode("voice", async (state) => {
      await markContentItemStep(state.contentItemId, "voice");
      const result = await runVoice(state.contentItemId, { voice, storage });
      return {
        audioStorageKey: result.audioStorageKey,
        captions: result.captions,
        voiceDurationSeconds: result.durationSeconds,
      };
    })
    .addNode("creative", async (state) => {
      await markContentItemStep(state.contentItemId, "creative");
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
        { llm, image, storage, ...(renderer !== undefined ? { renderer } : {}) },
      );
      return {};
    })
    .addNode("creative_static", async (state) => {
      await markContentItemStep(state.contentItemId, "creative");
      const format = await getContentItemFormat(state.contentItemId);
      if (format === "reel") {
        throw new Error("creative_static node reached for a reel-format content item");
      }
      await runCreativeStatic(
        state.contentItemId,
        { format },
        { llm, image, storage, ...(staticRenderer !== undefined ? { renderer: staticRenderer } : {}) },
      );
      return {};
    })
    .addNode("qa", async (state) => {
      await markContentItemStep(state.contentItemId, "qa");
      const result = await runQA(state.contentItemId, { llm });
      if (result.verdict === "pass") {
        // Auto-place it on the calendar the moment it's ready for review, so
        // the human reviewer sees a proposed date instead of an empty one.
        await assignScheduledSlot(state.contentItemId);
      }
      if (result.verdict === "pass" || result.needsHumanReview) {
        // About to pause for human input or stop entirely - no agent is
        // actively working on this item right now.
        await markContentItemStep(state.contentItemId, null);
      }
      return {
        qaVerdict: result.verdict,
        qaCategory: result.category,
        needsHumanReview: result.needsHumanReview,
      };
    })
    .addNode("human_approval", async (state) => {
      const decision = await awaitReviewDecision(state.contentItemId, "final");
      await recordApprovalDecision(state.contentItemId, "final", decision);
      return { approvalDecision: decision.decision, approvalTarget: decision.target };
    })
    .addNode("schedule_publish", async (state) => {
      const scheduledFor = await getContentItemSchedule(state.contentItemId);
      const delayMs = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
      await markContentItemScheduled(state.contentItemId);
      await onApproved(state.contentItemId, delayMs);
      return {};
    })
    .addEdge(START, "research")
    .addEdge("research", "content")
    // Every new script version (first draft, QA script retry, reviewer
    // revision) passes the human script gate before any media spend.
    .addEdge("content", "script_review")
    .addConditionalEdges("script_review", async (state) => {
      if (state.scriptDecision === "changes_requested") return "content";
      if (state.scriptDecision === "rejected") return END;
      const format = await getContentItemFormat(state.contentItemId);
      // Reels need synthesized narration before the background visuals can
      // be timed against it; carousel/post are static images with no audio.
      return format === "reel" ? "voice" : "creative_static";
    })
    .addEdge("voice", "creative")
    .addEdge("creative", "qa")
    .addEdge("creative_static", "qa")
    .addConditionalEdges("qa", async (state) => {
      if (state.qaVerdict === "pass") return "human_approval";
      if (state.needsHumanReview) return END;
      // A visual-only fail can re-render from the already-synthesized
      // voice output in state (reel) or straight from the content version
      // (carousel/post); a script fail needs a fresh script, which
      // cascades back through the content -> voice/creative_static edges.
      return state.qaCategory === "visual" ? resolveCreativeNode(state.contentItemId) : "content";
    })
    .addConditionalEdges("human_approval", async (state) => {
      if (state.approvalDecision === "approved") return "schedule_publish";
      if (state.approvalDecision === "changes_requested") {
        return state.approvalTarget === "creative"
          ? resolveCreativeNode(state.contentItemId)
          : "content";
      }
      return END; // rejected
    })
    .addEdge("schedule_publish", END);
}

export async function compileProductionGraph(databaseUrl: string) {
  const llm = new AnthropicLLMProvider();
  const search = new TavilySearchProvider(requireEnv("TAVILY_API_KEY"));
  const voice = new ElevenLabsVoiceProvider(
    requireEnv("ELEVENLABS_API_KEY"),
    requireEnv("ELEVENLABS_VOICE_ID"),
  );
  const image = new OpenAIImageProvider(requireEnv("OPENAI_API_KEY"));
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
  return buildProductionGraph({ llm, search, storage, voice, image }).compile({ checkpointer });
}
