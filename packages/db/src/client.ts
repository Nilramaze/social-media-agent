import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const queryClient = postgres(requireEnv("DATABASE_URL"));

export const db = drizzle(queryClient, { schema });
export type Db = typeof db;
