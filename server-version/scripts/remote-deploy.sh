#!/bin/bash
# =============================================================================
# PTool 远程服务器部署脚本
# 直接在服务器上执行: sudo bash remote-deploy.sh
# =============================================================================

set -Eeuo pipefail

cat >&2 <<'NOTICE'
此远程宿主机部署脚本已停用。
生产环境唯一支持的拓扑是 server-version/docker-compose.yml；请在目标主机安装
Docker/Compose，使用受保护的 .env，并按 Compose 文档启动服务。
升级时必须先 drain/stop 旧 backend、worker 和 public traffic，再完成备份、
guarded migration、四类 public-token backfill、release-preflight 和 smoke。
本脚本不会安装或操作宿主机 PostgreSQL、Redis、Nginx、PM2，也不会写入凭据。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

APP_DIR="/opt/ptool"
BACKEND_DIR="$APP_DIR/server-version/backend"
FRONTEND_DIR="$APP_DIR/server-version/frontend"
IP_ADDRESS="140.143.146.97"
DOMAIN="eduk12.top"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 24)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
DATA_ENCRYPTION_KEY="${DATA_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -hex 24)}"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查代码是否存在
check_prerequisites() {
    step "检查 prerequisites..."
    
    if [ ! -d "$BACKEND_DIR" ]; then
        error "后端代码不存在!"
        error "请先上传代码到: $APP_DIR"
        exit 1
    fi
    
    # 检查必要命令
    command -v node >/dev/null 2>&1 || { error "Node.js 未安装"; exit 1; }
    command -v psql >/dev/null 2>&1 || { error "PostgreSQL 未安装"; exit 1; }
    
    info "检查通过"
}

# 生成配置文件
generate_configs() {
    step "生成配置文件..."
    
    cd "$BACKEND_DIR"
    
    # 如果.env不存在，创建它
    if [ ! -f ".env" ]; then
        warn ".env 不存在，创建默认配置..."
        
        cat > .env << EOF
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgresql://ptool:$DB_PASSWORD@localhost:5432/ptool?schema=public&connection_limit=20
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
DATA_ENCRYPTION_KEY=$DATA_ENCRYPTION_KEY
COGNITIVE_MODULE_ENABLED=false
TRUST_PROXY_HOPS=1
CORS_ORIGIN=http://$IP_ADDRESS
REDIS_URL=redis://localhost:6379
VIDEO_LOW_POWER_MODE=true
VIDEO_RESOLUTION=480p
VIDEO_PRESET=ultrafast
VIDEO_CRF=28
VIDEO_BITRATE=800k
TEMP_DIR=/tmp/videos
MAX_DOWNLOAD_SIZE=2147483648
DOWNLOAD_TIMEOUT=900000
EOF
        
        # 保存凭证
        cat > /home/ubuntu/.ptool-credentials << EOF
PTool 部署凭证 - $(date)
========================
数据库密码: $DB_PASSWORD
JWT密钥: $JWT_SECRET
管理员账号: $ADMIN_USERNAME
管理员密码: $ADMIN_PASSWORD
数据加密密钥: $DATA_ENCRYPTION_KEY
========================
EOF
        chmod 600 /home/ubuntu/.ptool-credentials
        info "凭证已保存到: /home/ubuntu/.ptool-credentials"
    fi
    
    # 前端配置
    cd "$FRONTEND_DIR"
    if [ ! -f ".env.production" ]; then
        echo "VITE_API_URL=http://$IP_ADDRESS/api" > .env.production
    fi
    
    info "配置完成"
}

# 数据库迁移
setup_database() {
    step "设置数据库..."
    cd "$BACKEND_DIR"
    
    # 检查数据库是否存在
    if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw ptool; then
        warn "数据库不存在，创建中..."
        sudo -u postgres psql -c "CREATE DATABASE ptool;"
        sudo -u postgres psql -c "CREATE USER ptool WITH PASSWORD '$DB_PASSWORD';"
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ptool TO ptool;"
    fi
    
    # 执行迁移
    npm install
    npx prisma migrate deploy
    npx prisma generate
    ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run db:seed
    
    info "数据库设置完成"
}

# 构建后端
build_backend() {
    step "构建后端..."
    cd "$BACKEND_DIR"
    
    npm install
    npm run build
    
    info "后端构建完成"
}

# 构建前端
build_frontend() {
    step "构建前端..."
    cd "$FRONTEND_DIR"
    
    npm install
    npm run build
    
    # 部署到Nginx
    sudo rm -rf /var/www/html/*
    sudo cp -r dist/* /var/www/html/
    sudo chown -R www-data:www-data /var/www/html
    
    info "前端构建完成"
}

# 配置Nginx
setup_nginx() {
    step "配置Nginx..."
    
    sudo tee /etc/nginx/sites-available/ptool > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript;

    location / {
        root /var/www/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    client_max_body_size 500M;
}
EOF
    
    sudo ln -sf /etc/nginx/sites-available/ptool /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl restart nginx
    
    info "Nginx配置完成"
}

# 启动服务
start_services() {
    step "启动服务..."
    cd "$BACKEND_DIR"
    
    # 使用PM2启动
    if pm2 list | grep -q "ptool-api"; then
        pm2 restart ptool-api
    else
        pm2 start dist/index.js --name "ptool-api"
        pm2 save
        sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
    fi
    
    # 等待服务启动
    sleep 3
    
    # 验证
    if curl -s http://localhost:3000/health | grep -q "ok"; then
        info "✅ 服务启动成功!"
    else
        warn "⚠️  服务可能未完全启动，查看日志: pm2 logs ptool-api"
    fi
}

# 显示完成信息
show_completion() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║         🎉 PTool 部署完成!                                 ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📍 访问地址:"
    echo "   前台: http://$IP_ADDRESS"
    echo "   API:  http://$IP_ADDRESS/api/health"
    echo ""
echo "👤 管理员:"
echo "   账号: $ADMIN_USERNAME"
echo "   密码: 请从受保护凭证文件读取"
    echo ""
    echo "📁 重要路径:"
    echo "   应用: $APP_DIR"
    echo "   日志: pm2 logs ptool-api"
    echo "   凭证: /home/ubuntu/.ptool-credentials"
    echo ""
    echo "🔧 常用命令:"
    echo "   pm2 status           - 查看状态"
    echo "   pm2 logs ptool-api   - 查看日志"
    echo "   pm2 restart ptool-api - 重启服务"
    echo ""
}

# 主函数
main() {
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     PTool 远程部署脚本                                     ║"
    echo "║     服务器: $IP_ADDRESS                                     ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    check_prerequisites
    generate_configs
    setup_database
    build_backend
    build_frontend
    setup_nginx
    start_services
    show_completion
}

main

LEGACY_SCRIPT
