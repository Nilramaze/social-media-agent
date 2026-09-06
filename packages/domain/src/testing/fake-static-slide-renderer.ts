import { writeFile } from "node:fs/promises";
import type { SlideProps } from "@sma/creative";
import type { StaticSlideRenderer } from "../production/creative-static";

/**
 * Test double for StaticSlideRenderer - writes a tiny placeholder file
 * instead of running a real Remotion/headless-Chromium render, so domain
 * and graph tests stay fast.
 */
export class FakeStaticSlideRenderer implements StaticSlideRenderer {
  public readonly calls: SlideProps[] = [];

  async render(props: SlideProps, outputPath: string): Promise<void> {
    this.calls.push(props);
    await writeFile(outputPath, Buffer.from("fake-slide"));
  }
}
