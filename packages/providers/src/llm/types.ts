import type { z } from "zod";

export interface StructuredCallInput<T> {
  schema: z.ZodType<T>;
  system?: string;
  prompt: string;
  model: string;
  maxTokens?: number;
  maxRetries?: number;
}

export interface ToolSpec<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<string>;
}

export interface AgenticStructuredInput<T> {
  system?: string;
  prompt: string;
  model: string;
  schema: z.ZodType<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: ToolSpec<any>[];
  maxIterations?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  generateStructured<T>(input: StructuredCallInput<T>): Promise<T>;
  /**
   * Bounded tool-use loop: the model may call the given tools repeatedly,
   * then must call the implicit "submit_findings" tool (built from `schema`)
   * to finish. Throws if `maxIterations` is exhausted without a submission.
   */
  runAgenticStructured<T>(input: AgenticStructuredInput<T>): Promise<T>;
}
