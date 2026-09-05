import type { z } from "zod";

export interface StructuredCallInput<T> {
  schema: z.ZodType<T>;
  system?: string;
  prompt: string;
  model: string;
  maxTokens?: number;
  maxRetries?: number;
}

export interface LLMProvider {
  generateStructured<T>(input: StructuredCallInput<T>): Promise<T>;
}
