import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { runStructuredWithRepair } from "./repair-loop";
import type {
  AgenticStructuredInput,
  LLMProvider,
  StructuredCallInput,
} from "./types";

const SUBMIT_TOOL_NAME = "submit_findings";

function toAnthropicTool(
  name: string,
  description: string,
  schema: z.ZodType<unknown>,
): Anthropic.Tool {
  const { $schema: _drop, ...inputSchema } = z.toJSONSchema(schema) as Record<
    string,
    unknown
  >;
  return {
    name,
    description,
    input_schema: inputSchema as Anthropic.Tool.InputSchema,
  };
}

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

  async runAgenticStructured<T>({
    system,
    prompt,
    model,
    schema,
    tools,
    maxIterations = 6,
    maxTokens = 4000,
  }: AgenticStructuredInput<T>): Promise<T> {
    const anthropicTools: Anthropic.Tool[] = [
      ...tools.map((t) => toAnthropicTool(t.name, t.description, t.inputSchema)),
      toAnthropicTool(
        SUBMIT_TOOL_NAME,
        "Call this exactly once, when you have gathered enough information, with the final structured result.",
        schema,
      ),
    ];
    const toolsByName = new Map(tools.map((t) => [t.name, t]));
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: prompt },
    ];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        ...(system !== undefined ? { system } : {}),
        tools: anthropicTools,
        messages,
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      messages.push({ role: "assistant", content: response.content });

      const submission = toolUseBlocks.find((b) => b.name === SUBMIT_TOOL_NAME);
      if (submission) {
        const parsed = schema.safeParse(submission.input);
        if (parsed.success) {
          return parsed.data;
        }
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submission.id,
              content: `Ungueltige Uebermittlung: ${parsed.error.message}. Bitte ${SUBMIT_TOOL_NAME} erneut mit validen Daten aufrufen.`,
              is_error: true,
            },
          ],
        });
        continue;
      }

      if (toolUseBlocks.length === 0) {
        messages.push({
          role: "user",
          content: `Bitte nutze eines der verfuegbaren Tools oder rufe ${SUBMIT_TOOL_NAME} auf, sobald du genug Informationen hast.`,
        });
        continue;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const tool = toolsByName.get(block.name);
        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
          continue;
        }
        try {
          const input = tool.inputSchema.parse(block.input);
          const result = await tool.execute(input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: err instanceof Error ? err.message : String(err),
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error(
      `Agentic task did not call ${SUBMIT_TOOL_NAME} within ${maxIterations} iterations`,
    );
  }
}
