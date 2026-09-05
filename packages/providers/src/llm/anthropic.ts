import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { runStructuredWithRepair } from "./repair-loop";
import type { LLMProvider, StructuredCallInput } from "./types";

export class AnthropicLLMProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async generateStructured<T>({
    schema,
    system,
    prompt,
    model,
    maxTokens = 8000,
    maxRetries = 2,
  }: StructuredCallInput<T>): Promise<T> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: prompt },
    ];

    return runStructuredWithRepair<T>(async (repairNote) => {
      if (repairNote) {
        messages.push({
          role: "user",
          content: `Deine vorherige Antwort entsprach nicht dem geforderten Schema.\nFehler: ${repairNote}\nBitte antworte erneut, ausschliesslich mit validem JSON gemaess Schema.`,
        });
      }

      const response = await this.client.messages.parse({
        model,
        max_tokens: maxTokens,
        ...(system !== undefined ? { system } : {}),
        messages,
        output_config: { format: zodOutputFormat(schema) },
      });

      if (response.parsed_output !== null) {
        return { parsedOutput: response.parsed_output };
      }

      messages.push({ role: "assistant", content: response.content });
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      return {
        parsedOutput: null,
        errorSummary: textBlock
          ? `Antwort war kein valides JSON gemaess Schema: ${textBlock.text.slice(0, 500)}`
          : "Keine auswertbare Textantwort erhalten.",
      };
    }, maxRetries);
  }
}
