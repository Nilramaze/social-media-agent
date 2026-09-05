import assert from "node:assert/strict";
import { test } from "node:test";
import { MockPublishProvider } from "./mock";

test("rejects a non-public media URL", async () => {
  const provider = new MockPublishProvider();
  await assert.rejects(() => provider.createContainer("not-a-url", { caption: "x", format: "reel" }));
});

test("container status becomes finished after processing, then publish succeeds", async () => {
  const provider = new MockPublishProvider();
  const { containerId } = await provider.createContainer("https://example.com/video.mp4", {
    caption: "x",
    format: "reel",
  });

  assert.equal(await provider.getContainerStatus(containerId), "in_progress");

  await new Promise((resolve) => setTimeout(resolve, 2100));

  assert.equal(await provider.getContainerStatus(containerId), "finished");

  const { externalMediaId } = await provider.publish(containerId, "idem-1");
  assert.ok(externalMediaId.startsWith("mock_media_"));
});

test("publish is idempotent for the same idempotency key", async () => {
  const provider = new MockPublishProvider();
  const { containerId } = await provider.createContainer("https://example.com/video.mp4", {
    caption: "x",
    format: "reel",
  });
  await new Promise((resolve) => setTimeout(resolve, 2100));

  const first = await provider.publish(containerId, "idem-shared");
  const second = await provider.publish(containerId, "idem-shared");
  assert.equal(first.externalMediaId, second.externalMediaId);
});
