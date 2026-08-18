#!/bin/bash
# 前端自动部署脚本

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
