#!/bin/bash
# =============================================================================
# PTool 全自动部署脚本 - 在服务器上直接运行
# 配置: 2核4G5M / Ubuntu 22.04
# =============================================================================

set -Eeuo pipefail

cat >&2 <<'NOTICE'
此宿主机部署脚本已停用。
生产环境唯一支持的拓扑是 server-version/docker-compose.yml；请使用 Compose 文档
配置受保护的 .env 后启动 postgres、redis、backend 和 frontend 服务。
本脚本不会安装或操作宿主机 PostgreSQL、Redis、Nginx、PM2，也不会写入凭据。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# 检查root
if [ "$EUID" -ne 0 ]; then
    error "请使用 sudo 运行此脚本"
    exit 1
fi

# 配置变量（请修改以下值）
DOMAIN="${DOMAIN:-}"                          # 你的域名，如 edu.example.com
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@localhost}" # 管理员邮箱
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 24)}"     # 数据库密码（自动生成）
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"       # JWT密钥（自动生成）
DATA_ENCRYPTION_KEY="${DATA_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -hex 24)}" # 后台管理员密码
CORS_ORIGIN="${CORS_ORIGIN:-http://${DOMAIN:-140.143.146.97}}"

# COS配置（可选）
COS_SECRET_ID="${COS_SECRET_ID:-}"
COS_SECRET_KEY="${COS_SECRET_KEY:-}"
COS_BUCKET="${COS_BUCKET:-}"
COS_REGION="${COS_REGION:-ap-guangzhou}"

step "========== PTool 服务器自动部署 =========="
info "域名: $DOMAIN"
info "管理员邮箱: $ADMIN_EMAIL"

# 确认
if [ -z "$DOMAIN" ]; then
    warn "未设置DOMAIN环境变量，将使用IP访问"
    read -p "继续? (y/n) " confirm
    [ "$confirm" != "y" ] && exit 0
fi

# 1. 系统更新
step "[1/10] 系统更新..."
apt-get update && apt-get upgrade -y

# 2. 安装依赖
step "[2/10] 安装基础依赖..."
apt-get install -y curl wget git vim htop nginx postgresql postgresql-contrib redis-server ufw

# 3. 安装Node.js 20
step "[3/10] 安装Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
node -v

# 4. 安装PM2和FFmpeg
step "[4/10] 安装PM2和FFmpeg..."
npm install -g pm2
apt-get install -y ffmpeg

# 5. 配置PostgreSQL
step "[5/10] 配置PostgreSQL..."
systemctl start postgresql
sudo -u postgres psql << EOF
CREATE DATABASE ptool;
CREATE USER ptool WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE ptool TO ptool;
\q
EOF

# 6. 创建应用目录
step "[6/10] 创建应用目录..."
mkdir -p /opt/ptool
cd /opt/ptool

# 7. 上传代码（这里需要手动上传或使用git）
step "[7/10] 准备代码..."
warn "请确保已将代码上传到 /opt/ptool/"
warn "如果未上传，请先执行: rsync -avz local-path root@140.143.146.97:/opt/ptool/"
read -p "代码已上传? (y/n) " confirm
[ "$confirm" != "y" ] && exit 1

# 8. 配置环境变量
step "[8/10] 配置环境变量..."
cd /opt/ptool/server-version/backend

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
CORS_ORIGIN=$CORS_ORIGIN
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

CREDENTIALS_FILE="/root/.ptool-credentials"
umask 077
cat > "$CREDENTIALS_FILE" << EOF
PTool deployment credentials
============================
Admin username: $ADMIN_USERNAME
Admin password: $ADMIN_PASSWORD
Database password: $DB_PASSWORD
JWT secret: $JWT_SECRET
Data encryption key: $DATA_ENCRYPTION_KEY
============================
EOF
info "凭据已保存到受保护文件: $CREDENTIALS_FILE"

if [ -n "$COS_SECRET_ID" ]; then
    cat >> .env << EOF
COS_SECRET_ID=$COS_SECRET_ID
COS_SECRET_KEY=$COS_SECRET_KEY
COS_BUCKET=$COS_BUCKET
COS_REGION=$COS_REGION
EOF
fi

# 前端环境变量
cd /opt/ptool/server-version/frontend
cat > .env.production << EOF
VITE_API_URL=https://${DOMAIN:-140.143.146.97}/api
EOF

# 9. 构建后端
step "[9/10] 构建应用..."
cd /opt/ptool/server-version/backend
npm install
npx prisma migrate deploy
npx prisma generate
ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run db:seed
npm run build

# 10. 构建前端
cd /opt/ptool/server-version/frontend
npm install
npm run build

# 11. 配置Nginx
step "[10/10] 配置Nginx..."
cat > /etc/nginx/sites-available/ptool << 'EOF'
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

ln -sf /etc/nginx/sites-available/ptool /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 复制前端文件
rm -rf /var/www/html/*
cp -r /opt/ptool/server-version/frontend/dist/* /var/www/html/
chown -R www-data:www-data /var/www/html

nginx -t && systemctl restart nginx

# 12. 启动服务
step "启动后端服务..."
cd /opt/ptool/server-version/backend
pm2 start dist/index.js --name "ptool-api"
pm2 save
pm2 startup

# 13. 配置防火墙
step "配置防火墙..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 14. 安装运维自动化
step "安装运维自动化..."
cd /opt/ptool
if [ -f server-version/scripts/monitoring/setup-monitoring.sh ]; then
    bash server-version/scripts/monitoring/setup-monitoring.sh
fi

# 15. SSL证书（如果有域名）
if [ -n "$DOMAIN" ]; then
    step "申请SSL证书..."
    apt-get install -y certbot python3-certbot-nginx
    certbot --nginx -d $DOMAIN --agree-tos --non-interactive --email $ADMIN_EMAIL
fi

# 完成
step "========== 部署完成 =========="
info "访问地址: http://${DOMAIN:-140.143.146.97}"
info "后台、数据库和加密凭据已保存到: /root/.ptool-credentials"
info ""
info "常用命令:"
info "  pm2 status          - 查看服务状态"
info "  pm2 logs ptool-api  - 查看日志"
info "  ptool-ops status    - 系统监控"
info ""

LEGACY_SCRIPT
