# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
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

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @modsmith/db generate && pnpm --filter @modsmith/web build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
# The standalone bundle already contains the traced Prisma client and engine, because the client is
# generated into packages/db/generated rather than the pnpm virtual store.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# Served as a download by /api/v1/server-hub/resource.
COPY --from=build /repo/packages/hub-resource ./packages/hub-resource
COPY --from=build /repo/packages/db/prisma ./packages/db/prisma
# Shared object storage when STORAGE_PROVIDER=local (a volume is mounted here by compose).
RUN mkdir -p /data/storage && chown -R app:app /data/storage
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
