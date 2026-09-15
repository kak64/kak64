# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
  && apt-get update && apt-get install -y --no-install-recommends p7zip-full unrar-free ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/services/package.json packages/services/
COPY packages/rage/package.json packages/rage/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS runner
ENV NODE_ENV=production
COPY . .
RUN pnpm --filter @modsmith/db generate
# Optional heavy tooling (Blender / CodeWalker CLI) can be layered in a derived image and pointed to via BLENDER_BIN / CODEWALKER_CLI.
RUN groupadd -r app && useradd -r -g app app && mkdir -p /repo/apps/worker/tmp && chown -R app:app /repo/apps/worker/tmp
USER app
CMD ["pnpm", "--filter", "@modsmith/worker", "start"]
