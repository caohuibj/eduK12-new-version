#!/bin/bash
# PTool v1.0 生产环境部署脚本
# 适用于: Ubuntu 22.04 LTS
# 配置: 2核4G5M 云服务器

set -e  # 遇错即停

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
APP_NAME="ptool"
APP_DIR="/opt/$APP_NAME"
BACKEND_DIR="$APP_DIR/server-version/backend"
FRONTEND_DIR="$APP_DIR/server-version/frontend"
NGINX_DIR="$APP_DIR/server-version/nginx"
DB_NAME="ptool"
DB_USER="ptool"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -hex 24)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
DATA_ENCRYPTION_KEY="${DATA_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
CORS_ORIGIN="${CORS_ORIGIN:-}"

# 打印信息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查root权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "请使用 sudo 运行此脚本"
        exit 1
    fi
}

# 安装基础依赖
install_dependencies() {
    print_info "安装基础依赖..."
    
    apt update && apt upgrade -y
    
    # 安装 Node.js 20
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt install -y nodejs
    fi
    
    # 安装其他依赖
    apt install -y git nginx postgresql postgresql-contrib redis-server
    
    # 安装 PM2
    npm install -g pm2
    
    print_info "基础依赖安装完成"
}

# 配置数据库
setup_database() {
    print_info "配置 PostgreSQL 数据库..."
    
    # 生成随机密码
    DB_PASSWORD=$(openssl rand -hex 32)
    
    # 创建数据库和用户
    sudo -u postgres psql << EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\q
EOF
    
    # 允许远程连接 (可选)
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/14/main/postgresql.conf
    echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/14/main/pg_hba.conf
    
    systemctl restart postgresql
    
    print_info "数据库配置完成"
    print_info "数据库凭据已生成，并将写入受保护的部署凭据文件"
}

# 配置环境变量
setup_environment() {
    print_info "配置环境变量..."

    if [ -z "$CORS_ORIGIN" ]; then
        print_error "必须通过 CORS_ORIGIN 指定实际前端 origin 后才能进行生产部署"
        return 1
    fi
    
    # 后端环境变量
    cat > $BACKEND_DIR/.env << EOF
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?schema=public

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800

# Admin (由脚本生成；不会写入日志)
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Data encryption
DATA_ENCRYPTION_KEY=$DATA_ENCRYPTION_KEY
COGNITIVE_MODULE_ENABLED=false
TRUST_PROXY_HOPS=1
CORS_ORIGIN=$CORS_ORIGIN

# COS (可选，但强烈推荐)
# COS_SECRET_ID=your-secret-id
# COS_SECRET_KEY=your-secret-key
# COS_BUCKET=your-bucket
# COS_REGION=ap-guangzhou
# COS_DOMAIN=https://your-bucket.cos.ap-guangzhou.myqcloud.com
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
    print_info "凭据已保存到受保护文件: $CREDENTIALS_FILE"
    
    # 前端环境变量
    cat > $FRONTEND_DIR/.env.production << EOF
VITE_API_URL=https://your-domain.com/api
# VITE_COS_DOMAIN=https://your-bucket.cos.ap-guangzhou.myqcloud.com
EOF
    
    print_warn "请编辑以下文件修改配置:"
    print_warn "  - $BACKEND_DIR/.env"
    print_warn "  - $FRONTEND_DIR/.env.production"
}

# 部署后端
deploy_backend() {
    print_info "部署后端服务..."
    
    cd $BACKEND_DIR
    
    # 安装依赖
    npm install
    
    # 数据库迁移
    npx prisma migrate deploy
    npx prisma generate
    
    # 构建
    npm run build
    
    # 使用 PM2 启动
    pm2 start dist/index.js --name "$APP_NAME-api" -- -p 3000
    pm2 save
    pm2 startup systemd
    
    print_info "后端部署完成"
}

# 部署前端
deploy_frontend() {
    print_info "部署前端..."
    
    cd $FRONTEND_DIR
    
    # 安装依赖
    npm install
    
    # 构建
    npm run build
    
    # 复制到 Nginx 目录
    rm -rf /var/www/html/*
    cp -r dist/* /var/www/html/
    chown -R www-data:www-data /var/www/html
    
    print_info "前端部署完成"
}

# 配置 Nginx
setup_nginx() {
    print_info "配置 Nginx..."
    
    cat > /etc/nginx/sites-available/$APP_NAME << 'EOF'
server {
    listen 80;
    server_name _;  # 接受所有域名，部署后请修改为实际域名
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # 前端静态文件
    location / {
        root /var/www/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
        
        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 上传文件大小限制
    client_max_body_size 500M;
}
EOF
    
    # 启用配置
    ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # 测试配置
    nginx -t
    
    # 重启 Nginx
    systemctl restart nginx
    
    print_info "Nginx 配置完成"
}

# 配置防火墙
setup_firewall() {
    print_info "配置防火墙..."
    
    # 允许 HTTP/HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 22/tcp
    
    # 启用防火墙 (确认后)
    print_warn "是否启用防火墙? (y/n)"
    read -r enable_firewall
    if [ "$enable_firewall" = "y" ]; then
        ufw --force enable
        print_info "防火墙已启用"
    fi
}

# 配置自动备份
setup_backup() {
    print_info "配置自动备份..."
    
    # 创建备份目录
    mkdir -p /backup/$APP_NAME
    
    # 创建备份脚本
    cat > /usr/local/bin/backup-$APP_NAME.sh << EOF
#!/bin/bash
DATE=\$(date +%Y%m%d_%H%M%S)
pg_dump -U $DB_USER $DB_NAME > /backup/$APP_NAME/db_\$DATE.sql
find /backup/$APP_NAME -name "db_*.sql" -mtime +7 -delete
EOF
    chmod +x /usr/local/bin/backup-$APP_NAME.sh
    
    # 添加定时任务 (每天凌晨3点备份)
    (crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/backup-$APP_NAME.sh") | crontab -
    
    print_info "自动备份已配置 (每天凌晨3点)"
}

# 显示部署信息
show_deployment_info() {
    echo ""
    echo "========================================"
    echo "  PTool v1.0 部署完成!"
    echo "========================================"
    echo ""
    echo "访问地址:"
    echo "  前端: http://$(hostname -I | awk '{print $1}')"
    echo "  后端: http://$(hostname -I | awk '{print $1}'):3000"
    echo ""
    echo "管理命令:"
    echo "  查看日志: pm2 logs $APP_NAME-api"
    echo "  重启服务: pm2 restart $APP_NAME-api"
    echo "  查看状态: pm2 status"
    echo ""
    echo "备份位置: /backup/$APP_NAME/"
    echo ""
    echo "重要提醒:"
    echo "  1. 管理员、数据库和加密凭据保存在 /root/.ptool-credentials"
    echo "  2. 建议配置 HTTPS (使用 certbot)"
    echo "  3. 建议配置 COS 存储以提升性能"
    echo "  4. 建议配置域名解析"
    echo ""
    echo "文档参考:"
    echo "  - 部署指南: $APP_DIR/server-version/CLOUD_DEPLOYMENT_GUIDE.md"
    echo "  - 性能分析: $APP_DIR/server-version/PERFORMANCE_ANALYSIS_2C2G3M.md"
    echo "========================================"
}

# 主函数
main() {
    echo "========================================"
    echo "  PTool v1.0 生产环境部署"
    echo "========================================"
    echo ""
    
    check_root
    
    print_info "开始部署..."
    print_warn "此脚本将安装 Node.js, PostgreSQL, Nginx 等软件"
    print_warn "建议在新服务器上运行"
    echo ""
    print_warn "是否继续? (y/n)"
    read -r confirm
    if [ "$confirm" != "y" ]; then
        exit 0
    fi
    
    install_dependencies
    setup_database
    setup_environment
    deploy_backend
    deploy_frontend
    setup_nginx
    setup_firewall
    setup_backup
    show_deployment_info
    
    print_info "部署完成!"
}

# 运行主函数
main
