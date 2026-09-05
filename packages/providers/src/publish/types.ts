export interface PublishMeta {
  caption: string;
  format: "reel" | "carousel" | "post";
}

export type ContainerStatus = "in_progress" | "finished" | "error";

export interface PublishProvider {
  createContainer(
    mediaUrl: string,
    meta: PublishMeta,
  ): Promise<{ containerId: string }>;
  getContainerStatus(containerId: string): Promise<ContainerStatus>;
  publish(
    containerId: string,
    idempotencyKey: string,
  ): Promise<{ externalMediaId: string }>;
}
