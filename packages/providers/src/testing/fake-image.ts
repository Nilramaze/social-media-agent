import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageProvider } from "../image/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

// A real (tiny, 1x1) PNG so this fake can be used in real-render
// integration tests - Remotion's <Img>/renderStill needs a decodable image.
const FAKE_PNG = readFileSync(join(__dirname, "fixtures", "fake-image.png"));

export class FakeImageProvider implements ImageProvider {
  public readonly calls: { prompt: string; size: "portrait" | "square" }[] = [];

  async generateImage(prompt: string, size: "portrait" | "square"): Promise<Buffer> {
    this.calls.push({ prompt, size });
    return FAKE_PNG;
  }
}
