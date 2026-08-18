#!/bin/bash
# 腾讯云部署脚本

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
  echo "  ./deploy-tencent.sh --ip <服务器IP> --password <密码>"
  echo "  ./deploy-tencent.sh --ip <服务器IP> --key <密钥文件路径>"
  exit 1
fi

echo "=== 开始部署到腾讯云服务器: $SERVER_IP ==="

# 准备 SSH 选项
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
  SSH_CMD="ssh $SSH_OPTS ubuntu@$SERVER_IP"
  SCP_TARGET="ubuntu@$SERVER_IP"
else
  SSH_CMD="sshpass -p '$SSH_PASSWORD' ssh $SSH_OPTS ubuntu@$SERVER_IP"
  SCP_TARGET="ubuntu@$SERVER_IP"
fi

# 1. 安装 Docker
echo "[1/6] 安装 Docker..."
$SSH_CMD << 'EOF'
  if ! command -v docker &> /dev/null; then
    # 腾讯云使用腾讯云镜像源
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker ubuntu
  fi
  docker --version
EOF

# 2. 安装 Docker Compose
echo "[2/6] 安装 Docker Compose..."
$SSH_CMD << 'EOF'
  if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
  fi
  docker-compose --version
EOF

# 3. 上传项目文件
echo "[3/6] 上传项目文件..."
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -n "$SSH_KEY" ]; then
  scp $SSH_OPTS -r "$PROJECT_DIR" $SCP_TARGET:/home/ubuntu/ptool
else
  sshpass -p "$SSH_PASSWORD" scp $SSH_OPTS -r "$PROJECT_DIR" $SCP_TARGET:/home/ubuntu/ptool
fi

# 4. 配置环境变量
echo "[4/6] 配置环境变量..."
$SSH_CMD << 'EOF'
  cd /home/ubuntu/ptool
  if [ ! -f .env ]; then
    cp .env.example .env
    # 生成随机密钥
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s/your-secret-key-change-in-production/$JWT_SECRET/g" .env
  fi
EOF

# 5. 启动服务
echo "[5/6] 启动服务..."
$SSH_CMD << 'EOF'
  cd /home/ubuntu/ptool
  sudo docker-compose down 2>/dev/null || true
  sudo docker-compose up -d
EOF

# 6. 检查状态
echo "[6/6] 检查服务状态..."
sleep 5
$SSH_CMD << 'EOF'
  cd /home/ubuntu/ptool
  sudo docker-compose ps
  echo ""
  echo "=== 部署完成 ==="
  echo "访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '请查看服务器公网IP')"
  echo "默认账号: admin / admin123"
EOF

echo ""
echo "=== 部署成功 ==="
echo "访问地址: http://$SERVER_IP"
echo "默认账号: admin / admin123"
echo ""
echo "查看日志: ssh ubuntu@$SERVER_IP 'cd /home/ubuntu/ptool && sudo docker-compose logs -f'"
