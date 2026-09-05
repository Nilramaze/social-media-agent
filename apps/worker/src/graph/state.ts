import { Annotation } from "@langchain/langgraph";

export const ProductionState = Annotation.Root({
  contentItemId: Annotation<string>(),
  qaVerdict: Annotation<"pass" | "fail" | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  qaCategory: Annotation<"script" | "visual" | "both" | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  needsHumanReview: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  approvalDecision: Annotation<
    "approved" | "changes_requested" | "rejected" | undefined
  >({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  approvalTarget: Annotation<"content" | "creative" | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
});
