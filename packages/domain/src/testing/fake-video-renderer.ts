import { writeFile } from "node:fs/promises";
import type { ReelProps } from "@sma/creative";
import type { VideoRenderer } from "../production/creative";

/**
 * Test double for VideoRenderer - writes a tiny placeholder file instead of
 * running a real Remotion/headless-Chromium render, so domain and graph
 * tests stay fast.
 */
export class FakeVideoRenderer implements VideoRenderer {
  public readonly calls: ReelProps[] = [];

  async render(props: ReelProps, outputPath: string): Promise<void> {
    this.calls.push(props);
    await writeFile(outputPath, Buffer.from("fake-video"));
  }
}
