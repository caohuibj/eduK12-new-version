# syntax=docker/dockerfile:1

# ============================================================
# eduK12 / PTool Frontend — Docker Baseline (Milestone C / 2A)
# 唯一 Host HTTP ingress（Nginx）
#   build   : Node 20 编译 Vite SPA
#   runtime : nginx:alpine 提供静态资源 + 反向代理
# ============================================================

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Release v1：构建期 Feature Flag（Vite 静态替换，值固化进产物）
ARG VITE_COGNITIVE_MODULE_ENABLED
ENV VITE_COGNITIVE_MODULE_ENABLED=${VITE_COGNITIVE_MODULE_ENABLED:-true}
RUN npm run build

FROM nginx:alpine AS runtime
# 覆盖默认站点：SPA + /api /uploads /socket.io 反向代理到 backend:3000
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
