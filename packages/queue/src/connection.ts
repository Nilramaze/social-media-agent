import IORedis from "ioredis";

let connection: IORedis | undefined;

export function getRedisConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("Missing required env var: REDIS_URL");
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}
