import type { ContainerStatus, PublishMeta, PublishProvider } from "./types";

export interface InstagramPublishConfig {
  igUserId: string;
  accessToken: string;
  apiVersion?: string;
}

interface InstagramErrorResponse {
  error?: { message?: string; type?: string; code?: number };
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;
  let detail = await res.text();
  try {
    const parsed = JSON.parse(detail) as InstagramErrorResponse;
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // keep raw text
  }
  throw new Error(`Instagram ${action} failed: ${res.status} ${detail}`);
}

/**
 * Instagram Graph API Content Publishing.
 * NOTE: unverified against a real Business Account / access token - built
 * against the documented API shape (Meta Graph API, Content Publishing).
 */
export class InstagramPublishProvider implements PublishProvider {
  constructor(private readonly config: InstagramPublishConfig) {}

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.config.apiVersion ?? "v23.0"}`;
  }

  async createContainer(
    mediaUrl: string,
    meta: PublishMeta,
  ): Promise<{ containerId: string }> {
    if (meta.format === "carousel") {
      throw new Error(
        "InstagramPublishProvider: carousel publishing is not implemented yet",
      );
    }

    const params = new URLSearchParams({
      access_token: this.config.accessToken,
      caption: meta.caption,
      media_type: "REELS",
      video_url: mediaUrl,
    });

    const res = await fetch(`${this.baseUrl}/${this.config.igUserId}/media`, {
      method: "POST",
      body: params,
    });
    await assertOk(res, "createContainer");

    const data = (await res.json()) as { id: string };
    return { containerId: data.id };
  }

  async getContainerStatus(containerId: string): Promise<ContainerStatus> {
    const params = new URLSearchParams({
      fields: "status_code",
      access_token: this.config.accessToken,
    });
    const res = await fetch(`${this.baseUrl}/${containerId}?${params}`);
    await assertOk(res, "getContainerStatus");

    const data = (await res.json()) as { status_code: string };
    if (data.status_code === "FINISHED") return "finished";
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      return "error";
    }
    return "in_progress";
  }

  async publish(
    containerId: string,
    _idempotencyKey: string,
  ): Promise<{ externalMediaId: string }> {
    // Instagram's API has no native idempotency key; the caller (runPublish)
    // is responsible for not calling this twice for the same content item -
    // enforced via the publish_jobs row before this is ever invoked.
    const status = await this.getContainerStatus(containerId);
    if (status !== "finished") {
      throw new Error(
        `InstagramPublishProvider: container ${containerId} not finished (status: ${status})`,
      );
    }

    const params = new URLSearchParams({
      creation_id: containerId,
      access_token: this.config.accessToken,
    });
    const res = await fetch(
      `${this.baseUrl}/${this.config.igUserId}/media_publish`,
      { method: "POST", body: params },
    );
    await assertOk(res, "publish");

    const data = (await res.json()) as { id: string };
    return { externalMediaId: data.id };
  }
}
