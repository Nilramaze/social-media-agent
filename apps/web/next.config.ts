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
  // @sma/domain's barrel export pulls in @sma/creative (Remotion) even for
  // routes that only touch plain DB helpers. Remotion's renderer does
  // platform-conditional `require()` calls for its native compositor
  // binary that the bundler can't statically resolve - leave it external
  // so Node resolves it at runtime instead (same as the worker, which
  // isn't bundled at all).
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler", "@sma/creative"],
};

export default nextConfig;
