import { randomUUID } from "node:crypto";
import type {
  ContainerStatus,
  PublishMeta,
  PublishProvider,
} from "./types";

const PROCESSING_MS = 2000;

export class MockPublishProvider implements PublishProvider {
  private readonly containers = new Map<string, { createdAt: number }>();
  private readonly published = new Map<string, string>();

  async createContainer(
    mediaUrl: string,
    _meta: PublishMeta,
  ): Promise<{ containerId: string }> {
    if (!mediaUrl.startsWith("http")) {
      throw new Error(
        `MockPublishProvider: mediaUrl must be a public URL, got "${mediaUrl}"`,
      );
    }
    const containerId = randomUUID();
    this.containers.set(containerId, { createdAt: Date.now() });
    return { containerId };
  }

  async getContainerStatus(containerId: string): Promise<ContainerStatus> {
    const container = this.containers.get(containerId);
    if (!container) return "error";
    const elapsed = Date.now() - container.createdAt;
    return elapsed >= PROCESSING_MS ? "finished" : "in_progress";
  }

  async publish(
    containerId: string,
    idempotencyKey: string,
  ): Promise<{ externalMediaId: string }> {
    const existing = this.published.get(idempotencyKey);
    if (existing) {
      return { externalMediaId: existing };
    }

    const status = await this.getContainerStatus(containerId);
    if (status !== "finished") {
      throw new Error(
        `MockPublishProvider: container ${containerId} not finished (status: ${status})`,
      );
    }

    const externalMediaId = `mock_media_${randomUUID()}`;
    this.published.set(idempotencyKey, externalMediaId);
    return { externalMediaId };
  }
}
