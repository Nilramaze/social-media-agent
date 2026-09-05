import { S3StorageProvider } from "@sma/providers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let storage: S3StorageProvider | undefined;

export function getStorageProvider(): S3StorageProvider {
  if (!storage) {
    storage = new S3StorageProvider({
      endpoint: requireEnv("S3_ENDPOINT"),
      region: process.env.S3_REGION ?? "us-east-1",
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      bucket: requireEnv("S3_BUCKET"),
      forcePathStyle: true,
    });
  }
  return storage;
}
