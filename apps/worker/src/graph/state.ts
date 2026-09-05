import { Annotation } from "@langchain/langgraph";

export const ProductionState = Annotation.Root({
  contentItemId: Annotation<string>(),
});
