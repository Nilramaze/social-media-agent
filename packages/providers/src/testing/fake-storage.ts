import type { StorageProvider } from "../storage/types";

/**
 * In-memory test double for StorageProvider - avoids touching real S3/MinIO
 * in unit and graph tests.
 */
export class FakeStorageProvider implements StorageProvider {
  public readonly uploads = new Map<string, { buffer: Buffer; contentType: string }>();

  async upload(buffer: Buffer, key: string, contentType: string) {
    this.uploads.set(key, { buffer, contentType });
    return { storageKey: key };
  }

  getPublicUrl(key: string): string {
    return `https://fake-storage.test/${key}`;
  }

  async getSignedUrl(key: string, _ttlSeconds: number): Promise<string> {
    return `https://fake-storage.test/${key}?signed=1`;
  }
}
