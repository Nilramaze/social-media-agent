export interface ImageProvider {
  generateImage(prompt: string, size: "portrait" | "square"): Promise<Buffer>;
}
