import { join } from "node:path";
import type { NextConfig } from "next";

// Env vars live in the monorepo root .env, not apps/web/.env (Next only
// auto-loads the latter). Load the root file explicitly before anything else.
try {
  process.loadEnvFile(join(import.meta.dirname, "../../.env"));
} catch {
  // No root .env yet (e.g. fresh checkout) - fine, falls back to process env.
}

const nextConfig: NextConfig = {
  agentRules: false,
};

export default nextConfig;
