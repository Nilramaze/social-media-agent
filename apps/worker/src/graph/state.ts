import { Annotation } from "@langchain/langgraph";

export const ProductionState = Annotation.Root({
  contentItemId: Annotation<string>(),
  qaVerdict: Annotation<"pass" | "fail" | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  needsHumanReview: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
});
