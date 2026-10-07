# syntax=docker/dockerfile:1

# ============================================================
# eduK12 / PTool Backend — Docker Baseline (Milestone C / 2A)
# Targets: deps | build | runtime | ops
#   runtime : 长期运行 backend (node dist/index.js)
#   ops     : 一次性 migration / seed (保留 prisma CLI + tsx)
# ============================================================

# ---------- Stage 1: deps（完整安装，供 build + prisma generate） ----------
FROM node:24.21.0-bookworm-slim AS deps
WORKDIR /app

# 可通过 --build-arg npm_config_jobs=1 降低并行，避免 native 编译 OOM（Milestone C §18）
ARG npm_config_jobs
ENV npm_config_jobs=${npm_config_jobs:-}

# Optional regional mirrors for deployment hosts far from the default
# endpoints. Empty/official defaults keep hosted CI builds unchanged;
# release-verify-local.sh forwards them from RELEASE_VERIFY_* env vars.
ARG DEBIAN_MIRROR=
ARG NPM_REGISTRY=https://registry.npmjs.org

# 编译期系统依赖（canvas 等 native module 需要）
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
        if [ -f "$f" ]; then sed -i "s|http://deb.debian.org|http://$DEBIAN_MIRROR|g" "$f"; fi; \
      done; \
    fi \
    && apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci

# ---------- Stage 2: build ----------
FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY vitest.config.ts ./
COPY scripts/pr24-migration-preflight.mjs ./scripts/pr24-migration-preflight.mjs
COPY scripts/release-data-preflight.mjs ./scripts/release-data-preflight.mjs
COPY scripts/release-schema-contract.mjs ./scripts/release-schema-contract.mjs
COPY scripts/runtime-role-contract.mjs ./scripts/runtime-role-contract.mjs
COPY scripts/runtime-table-policy.json ./scripts/runtime-table-policy.json
COPY scripts/assert-release-test-report.mjs ./scripts/assert-release-test-report.mjs
COPY scripts/generate-scale-instruments.ts ./scripts/generate-scale-instruments.ts
COPY scripts/scale-onboarding-check.mjs ./scripts/scale-onboarding-check.mjs
COPY scripts/scale-onboarding-boundaries.json ./scripts/scale-onboarding-boundaries.json
COPY scripts/check-scale-source-qualification.ts ./scripts/check-scale-source-qualification.ts
COPY scripts/generate-situational-instruments.mjs ./scripts/generate-situational-instruments.mjs
COPY src ./src
COPY assets ./assets
RUN npm run build

# Prune development-only tooling before transferring dependencies into the
# long-running image.  This keeps the runtime copy small and avoids a costly
# recursive ownership rewrite over the complete build-time node_modules tree.
FROM build AS prod-deps
RUN npm prune --omit=dev

# ---------- Stage 3: runtime（生产运行，仅 production 依赖） ----------
FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

ARG DEBIAN_MIRROR=

# 运行时系统库（无编译器）；ffmpeg 由 fluent-ffmpeg 直接调用
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
        if [ -f "$f" ]; then sed -i "s|http://deb.debian.org|http://$DEBIAN_MIRROR|g" "$f"; fi; \
      done; \
    fi \
    && apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    fonts-liberation \
    ca-certificates \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# 复用 build 阶段已编译好的 node_modules（同源 ABI，native 二进制可直接用）
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/assets ./assets
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts/runtime-role-contract.mjs /app/scripts/release-schema-contract.mjs ./scripts/
COPY --from=build --chown=node:node /app/scripts/runtime-table-policy.json ./scripts/
COPY package*.json ./

# npm is needed by the build and ops stages, but the long-running API only
# executes Node. Removing the bundled package manager also keeps its own
# transitive dependency tree out of the production attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# The long-running API and workers do not need root. Keep the mounted upload
# volume writable by the application user while leaving the image immutable.
RUN mkdir -p /app/uploads /app/.local /app/exports \
    && chown node:node /app/uploads /app/.local /app/exports \
    && chmod 750 /app/uploads /app/exports \
    && chmod 700 /app/.local
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]

# ---------- Stage 4: ops（migrate / seed 一次性任务，保留 devDependencies） ----------
FROM build AS ops
WORKDIR /app
COPY scripts/runtime-role-defaults.sql ./scripts/runtime-role-defaults.sql
# 继承 build 阶段的完整 node_modules（含 prisma CLI 与 tsx）
# compose 通过 profiles: ["ops"] + command 调用：
#   migrate -> npm run db:migrate:guarded
#   seed    -> npm run db:seed
