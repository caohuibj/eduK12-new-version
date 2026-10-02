#!/bin/bash
# 前端自动部署脚本

set -Eeuo pipefail

cat >&2 <<'NOTICE'
此宿主机前端部署脚本已停用。
生产前端必须作为 server-version/docker-compose.yml 的 frontend 服务发布，
由 Compose 管理构建、Nginx 代理和健康检查；请勿直接覆盖宿主机 Nginx 目录。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

echo "=== 开始部署前端 ==="

# 1. 编译前端
cd /opt/ptool/server-version/frontend
npm run build

# 2. 同步到Nginx目录
sudo rm -rf /usr/share/nginx/html/*
sudo cp -rf /opt/ptool/server-version/frontend/dist/* /usr/share/nginx/html/
sudo chown -R root:root /usr/share/nginx/html/

# 3. 重载Nginx
sudo systemctl reload nginx

echo "✅ 前端部署完成: $(date)"

LEGACY_SCRIPT
