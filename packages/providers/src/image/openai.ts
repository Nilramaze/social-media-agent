import type { ImageProvider } from "./types";

const SIZE_MAP = {
  portrait: "1024x1536",
  square: "1024x1024",
} as const;

interface OpenAIImageResponse {
  data: { b64_json?: string }[];
}

/**
 * OpenAI Images API (gpt-image-1).
 * NOTE: unverified against a real API key/response - built against the
 * documented request/response shape. gpt-image-1 always returns base64
 * (no response_format/url option like older dall-e-2/3 models).
 */
export class OpenAIImageProvider implements ImageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-image-1",
  ) {}

  async generateImage(prompt: string, size: "portrait" | "square"): Promise<Buffer> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        size: SIZE_MAP[size],
        n: 1,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI image generation failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OpenAIImageResponse;
    const b64 = data.data[0]?.b64_json;
    if (!b64) throw new Error("OpenAI image generation returned no image data");

    return Buffer.from(b64, "base64");
  }
}
