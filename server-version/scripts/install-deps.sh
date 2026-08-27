#!/bin/bash
# PTool 视频处理依赖安装脚本
# 安装 FFmpeg 和 Redis

set -e

cat >&2 <<'NOTICE'
此宿主机依赖安装入口已停用。
FFmpeg、Redis 和应用运行时依赖由 Docker Compose 镜像管理；请不要在宿主机执行
apt、systemctl 或 Redis/PostgreSQL 安装操作。参阅 server-version/docker-compose.yml。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

echo "========================================"
echo "  PTool 视频处理依赖安装"
echo "========================================"
echo ""

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用 sudo 运行此脚本"
  exit 1
fi

# 检测操作系统
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$NAME
else
  echo "❌ 无法检测操作系统"
  exit 1
fi

echo "📦 检测到操作系统: $OS"
echo ""

# Ubuntu/Debian
if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
  echo "🔄 更新软件包列表..."
  apt update

  echo ""
  echo "📥 安装 FFmpeg..."
  apt install -y ffmpeg

  echo ""
  echo "📥 安装 Redis..."
  apt install -y redis-server

  echo ""
  echo "⚙️ 配置 Redis..."
  # 允许远程连接 (可选)
  sed -i 's/^bind 127.0.0.1 ::1/bind 127.0.0.1/' /etc/redis/redis.conf
  
  # 启用 systemd
  systemctl enable redis-server
  systemctl start redis-server

# CentOS/RHEL
elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
  echo "🔄 安装 EPEL 仓库..."
  yum install -y epel-release

  echo ""
  echo "📥 安装 FFmpeg..."
  yum install -y ffmpeg

  echo ""
  echo "📥 安装 Redis..."
  yum install -y redis

  echo ""
  echo "⚙️ 配置 Redis..."
  systemctl enable redis
  systemctl start redis

# Alpine (Docker)
elif [[ "$OS" == *"Alpine"* ]]; then
  echo "🔄 更新软件包..."
  apk update

  echo ""
  echo "📥 安装 FFmpeg..."
  apk add ffmpeg

  echo ""
  echo "📥 安装 Redis..."
  apk add redis
  
  echo ""
  echo "⚙️ 启动 Redis..."
  redis-server --daemonize yes

else
  echo "❌ 不支持的操作系统: $OS"
  echo "请手动安装 FFmpeg 和 Redis"
  exit 1
fi

echo ""
echo "✅ 安装完成!"
echo ""

# 验证安装
echo "🔍 验证 FFmpeg:"
ffmpeg -version | head -1

echo ""
echo "🔍 验证 Redis:"
redis-cli ping

echo ""
echo "========================================"
echo "  FFmpeg 和 Redis 安装成功!"
echo "========================================"
echo ""
echo "Redis 状态:"
systemctl status redis-server --no-pager || systemctl status redis --no-pager
LEGACY_SCRIPT
