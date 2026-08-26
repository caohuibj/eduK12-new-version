#!/bin/bash
# 阿里云部署脚本

set -e

SERVER_IP=""
SSH_KEY=""
SSH_PASSWORD=""

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --ip)
      SERVER_IP="$2"
      shift 2
      ;;
    --key)
      SSH_KEY="$2"
      shift 2
      ;;
    --password)
      SSH_PASSWORD="$2"
      shift 2
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

if [ -z "$SERVER_IP" ]; then
  echo "使用方法:"
  echo "  ./deploy-aliyun.sh --ip <服务器IP> --password <密码>"
  echo "  ./deploy-aliyun.sh --ip <服务器IP> --key <密钥文件路径>"
  exit 1
fi

echo "=== 开始部署到阿里云服务器: $SERVER_IP ==="

# 准备 SSH 选项
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
  SSH_CMD="ssh $SSH_OPTS root@$SERVER_IP"
else
  SSH_CMD="sshpass -p '$SSH_PASSWORD' ssh $SSH_OPTS root@$SERVER_IP"
fi

# 1. 安装 Docker
echo "[1/6] 安装 Docker..."
$SSH_CMD << 'EOF'
  if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    usermod -aG docker root
  fi
  docker --version
EOF

# 2. 安装 Docker Compose
echo "[2/6] 安装 Docker Compose..."
$SSH_CMD << 'EOF'
  if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
  fi
  docker-compose --version
EOF

# 3. 上传项目文件
echo "[3/6] 上传项目文件..."
if [ -n "$SSH_KEY" ]; then
  scp $SSH_OPTS -r "$(dirname "$0")" root@$SERVER_IP:/opt/ptool
else
  sshpass -p "$SSH_PASSWORD" scp $SSH_OPTS -r "$(dirname "$0")" root@$SERVER_IP:/opt/ptool
fi

# 4. 配置环境变量
echo "[4/6] 配置环境变量..."
$SSH_CMD << 'EOF'
  cd /opt/ptool
  if [ ! -f .env ]; then
    DB_USER=ptool
    DB_PASSWORD=$(openssl rand -hex 32)
    DB_NAME=ptool
    JWT_SECRET=$(openssl rand -hex 32)
    DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)
    DATA_PSEUDONYM_KEY=$(openssl rand -hex 32)
    ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
    ADMIN_PASSWORD=$(openssl rand -hex 24)
    GRAFANA_PASSWORD=$(openssl rand -hex 24)
    CORS_ORIGIN=${CORS_ORIGIN:-http://$(hostname -I | awk '{print $1}')}
    umask 077
    cat > .env << ENV_VARS
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@postgres:5432/$DB_NAME?schema=public
POSTGRES_EXPORTER_DATA_SOURCE_NAME=postgresql://$DB_USER:$DB_PASSWORD@postgres:5432/$DB_NAME?sslmode=disable
NODE_ENV=production
JWT_SECRET=$JWT_SECRET
DATA_ENCRYPTION_KEY=$DATA_ENCRYPTION_KEY
DATA_PSEUDONYM_KEY=$DATA_PSEUDONYM_KEY
COGNITIVE_MODULE_ENABLED=false
VITE_COGNITIVE_MODULE_ENABLED=false
MATERIAL_GRANTS_ENABLED=true
CORS_ORIGIN=$CORS_ORIGIN
TRUST_PROXY_HOPS=1
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
ENV_VARS
    cat > /root/.ptool-credentials << CREDENTIALS
PTool deployment credentials
============================
Admin username: $ADMIN_USERNAME
Admin password: $ADMIN_PASSWORD
Database password: $DB_PASSWORD
JWT secret: $JWT_SECRET
Data encryption key: $DATA_ENCRYPTION_KEY
============================
CREDENTIALS
    chmod 600 .env /root/.ptool-credentials
  fi
EOF

# 5. 启动服务
echo "[5/6] 启动服务..."
$SSH_CMD << 'EOF'
  cd /opt/ptool
  docker-compose down 2>/dev/null || true
  docker-compose --profile ops run --rm migrate
  docker-compose --profile ops run --rm seed
  docker-compose up -d backend frontend
EOF

# 6. 检查状态
echo "[6/6] 检查服务状态..."
sleep 5
$SSH_CMD << 'EOF'
  cd /opt/ptool
  docker-compose ps
  echo ""
  echo "=== 部署完成 ==="
  echo "访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '请查看服务器公网IP')"
  echo "管理员凭据: /root/.ptool-credentials"
EOF

echo ""
echo "=== 部署成功 ==="
echo "访问地址: http://$SERVER_IP"
echo "管理员凭据: /root/.ptool-credentials"
echo ""
echo "查看日志: ssh root@$SERVER_IP 'cd /opt/ptool && docker-compose logs -f'"
