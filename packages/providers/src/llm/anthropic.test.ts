import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AnthropicLLMProvider } from "./anthropic";

const schema = z.object({ hook: z.string() });

function providerWithParse(parse: (args: unknown) => Promise<unknown>) {
  const fakeClient = { messages: { parse } } as unknown as Anthropic;
  return new AnthropicLLMProvider(undefined, fakeClient);
}

// Regression: the SDK's zodOutputFormat parser throws on truncated JSON
// (e.g. the model hit max_tokens mid-string) instead of returning
// parsed_output: null. That used to escape the repair loop and kill the job.
test("recovers via the repair loop when the SDK throws on malformed JSON", async () => {
  let calls = 0;
  const provider = providerWithParse(async () => {
    calls++;
    if (calls === 1) {
      throw new Error(
        "Failed to parse structured output as JSON: Unterminated string in JSON at position 19208",
      );
    }
    return { parsed_output: { hook: "Ein konkreter Hook" }, content: [] };
  });

  const result = await provider.generateStructured({
    schema,
    prompt: "test",
    model: "claude-sonnet-5",
  });

  assert.deepEqual(result, { hook: "Ein konkreter Hook" });
  assert.equal(calls, 2);
});

test("gives up after maxRetries when the SDK keeps throwing", async () => {
  let calls = 0;
  const provider = providerWithParse(async () => {
    calls++;
    throw new Error("Failed to parse structured output: schema mismatch");
  });

  await assert.rejects(
    () =>
      provider.generateStructured({
        schema,
        prompt: "test",
        model: "claude-sonnet-5",
        maxRetries: 1,
      }),
    /schema mismatch/,
  );
  assert.equal(calls, 2);
});
