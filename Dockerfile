FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/novel-reader/package.json ./artifacts/novel-reader/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# Build shared libs
RUN pnpm run typecheck:libs
# Build frontend (outputs to artifacts/novel-reader/dist/public)
ENV BASE_PATH=/
ENV PORT=3000
RUN pnpm --filter @workspace/novel-reader run build
# Build backend
RUN pnpm --filter @workspace/api-server run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-slim AS production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=build /app/artifacts/api-server/dist ./server
# Frontend built assets served by Express under /public
COPY --from=build /app/artifacts/novel-reader/dist/public ./server/public

ENV NODE_ENV=production
ENV PORT=8080
ENV PUBLIC_DIR=/app/server/public

EXPOSE 8080
CMD ["node", "server/index.mjs"]
