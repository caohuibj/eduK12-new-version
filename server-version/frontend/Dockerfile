# syntax=docker/dockerfile:1

# ============================================================
# eduK12 / PTool Frontend — Docker Baseline (Milestone C / 2A)
# 唯一 Host HTTP ingress（Nginx）
#   build   : Node 24 LTS 编译 Vite SPA
#   runtime : pinned Nginx 提供静态资源 + 反向代理
# ============================================================

FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
# Optional regional npm mirror; the default keeps the official registry so
# hosted CI builds are unchanged.
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY package*.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci
COPY . .
# Release v1：构建期 Feature Flag（Vite 静态替换，值固化进产物）
ARG VITE_COGNITIVE_MODULE_ENABLED
ENV VITE_COGNITIVE_MODULE_ENABLED=${VITE_COGNITIVE_MODULE_ENABLED:-true}
RUN npm run build

FROM nginx:1.31.6-alpine3.24-slim AS runtime
# Apply the latest Alpine security updates to the runtime image before it is
# scanned and before the static assets are copied in.
RUN apk upgrade --no-cache \
    && apk add --no-cache --upgrade 'libexpat>=2.8.5-r0'
# 覆盖默认站点：SPA + /api /uploads /socket.io 反向代理到 backend:3000
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
