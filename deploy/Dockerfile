# Multi-target image for the social-media-agent monorepo.
#   docker build -f deploy/Dockerfile --target web    .
#   docker build -f deploy/Dockerfile --target worker .
# docker-compose.prod.yml selects the target per service; both share the
# `deps` stage so the (large) pnpm install only happens once.

# --- deps: full monorepo install -------------------------------------------
FROM node:22-bookworm-slim AS deps

RUN npm install -g pnpm@11.25.0

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

# Dev deps stay installed on purpose: the worker runs through tsx and the
# workspace packages are consumed as TypeScript sources.
RUN pnpm install --frozen-lockfile

# --- web: Next.js production build ------------------------------------------
FROM deps AS web

# The db client reads DATABASE_URL at module load, which `next build` hits
# while collecting route metadata. It never connects during the build, so a
# placeholder is enough - the real value comes from the container env.
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN DATABASE_URL=$BUILD_DATABASE_URL pnpm --filter @sma/web build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["pnpm", "exec", "next", "start"]

# --- worker: BullMQ workers + Remotion rendering -----------------------------
FROM deps AS worker

# Runtime libraries Chrome Headless Shell needs (Remotion's render engine)
# plus fonts so slide/reel text doesn't fall back to tofu boxes.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/worker

# Remotion downloads Chrome Headless Shell into <cwd package>/node_modules/.remotion
# on first render. Do it at build time from the worker's cwd so the image is
# self-contained and a container restart doesn't re-download ~150 MB.
RUN node -e "import(require.resolve('@remotion/renderer', { paths: ['/app/packages/creative'] })).then((m) => m.ensureBrowser()).then(() => console.log('chrome headless shell ready'))"

ENV NODE_ENV=production
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
