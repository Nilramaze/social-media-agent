import type {
  AgenticStructuredInput,
  LLMProvider,
  StructuredCallInput,
} from "../llm/types";

/**
 * Test double for LLMProvider. Configure with canned responses (or callbacks
 * that inspect the input) so domain logic can be tested end-to-end against a
 * real database without calling the real Anthropic API.
 */
export class FakeLLMProvider implements LLMProvider {
  constructor(
    private readonly handlers: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generateStructured?: (input: StructuredCallInput<any>) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runAgenticStructured?: (input: AgenticStructuredInput<any>) => any;
    },
  ) {}

  async generateStructured<T>(input: StructuredCallInput<T>): Promise<T> {
    if (!this.handlers.generateStructured) {
      throw new Error("FakeLLMProvider: generateStructured not configured");
    }
    return this.handlers.generateStructured(input);
  }

  async runAgenticStructured<T>(input: AgenticStructuredInput<T>): Promise<T> {
    if (!this.handlers.runAgenticStructured) {
      throw new Error("FakeLLMProvider: runAgenticStructured not configured");
    }
    return this.handlers.runAgenticStructured(input);
  }
}
