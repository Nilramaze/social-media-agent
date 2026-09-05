export interface StorageProvider {
  upload(buffer: Buffer, key: string, contentType: string): Promise<{ storageKey: string }>;
  getPublicUrl(key: string): string;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
}
