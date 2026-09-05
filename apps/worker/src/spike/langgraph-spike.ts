import {
  Annotation,
  Command,
  END,
  interrupt,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const SpikeState = Annotation.Root({
  value: Annotation<string>(),
});

function buildGraph() {
  return new StateGraph(SpikeState)
    .addNode("nodeA", async (state) => {
      console.log("[nodeA] running, state:", state);
      return { value: `${state.value}-a` };
    })
    .addNode("nodeB", async (state) => {
      console.log("[nodeB] running, state before interrupt:", state);
      const approval = interrupt({ question: "approve?", state });
      console.log("[nodeB] resumed with:", approval);
      return { value: `${state.value}-b-${approval}` };
    })
    .addEdge(START, "nodeA")
    .addEdge("nodeA", "nodeB")
    .addEdge("nodeB", END);
}

async function main() {
  const mode = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  if (mode !== "start" && mode !== "resume") {
    throw new Error("Usage: tsx langgraph-spike.ts <start|resume>");
  }

  const checkpointer = PostgresSaver.fromConnString(url);
  await checkpointer.setup();

  const graph = buildGraph().compile({ checkpointer });
  const config = { configurable: { thread_id: "spike-thread-1" } };

  if (mode === "start") {
    const result = await graph.invoke({ value: "init" }, config);
    console.log("[start] result:", JSON.stringify(result, null, 2));
    console.log(
      "[start] process now exits WITHOUT resuming — simulating a crash/restart.",
    );
    process.exit(0);
  }

  if (mode === "resume") {
    const result = await graph.invoke(
      new Command({ resume: "yes-approved" }),
      config,
    );
    console.log("[resume] result:", JSON.stringify(result, null, 2));

    if (result.value !== "init-a-b-yes-approved") {
      throw new Error(`Unexpected final state: ${JSON.stringify(result)}`);
    }
    console.log(
      "[resume] OK: graph resumed correctly after process restart via Postgres checkpointer.",
    );
  }
}

main()
  .catch((err) => {
    console.error("[spike] FAILED", err);
    process.exit(1);
  })
  .finally(() => {
    if (process.argv[2] === "resume") process.exit(0);
  });
