#!/bin/bash
# 本地测试脚本

set -e

echo "=== PTool 本地测试脚本 ==="
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    echo ""
    echo "请按以下步骤安装 Docker："
    echo "1. 执行: brew install --cask docker"
    echo "2. 打开 Docker Desktop 应用"
    echo "3. 等待 Docker 启动完成"
    echo ""
    echo "或访问: https://docs.docker.com/desktop/install/mac-install/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    echo "正在安装..."
    brew install docker-compose
fi

echo "✅ Docker 已安装"
docker --version
docker-compose --version
echo ""

# 检查 Docker 是否运行
if ! docker info &> /dev/null; then
    echo "❌ Docker 未运行"
    echo "请打开 Docker Desktop 应用并等待启动完成"
    exit 1
fi

echo "✅ Docker 正在运行"
echo ""

# 进入项目目录
cd "$(dirname "$0")"

# 创建环境变量文件
if [ ! -f .env ]; then
    echo "📝 创建环境变量文件..."
    cp .env.example .env
    # 生成随机 JWT 密钥
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i.bak "s/your-secret-key-change-in-production/$JWT_SECRET/g" .env
    rm -f .env.bak
    echo "✅ 环境变量文件已创建"
else
    echo "✅ 环境变量文件已存在"
fi
echo ""

# 创建上传目录
echo "📁 创建上传目录..."
mkdir -p uploads/videos uploads/images uploads/covers
echo "✅ 上传目录已创建"
echo ""

# 停止旧服务
echo "🛑 停止旧服务..."
docker-compose down 2>/dev/null || true
echo ""

# 构建并启动
echo "🏗️  构建并启动服务..."
echo "（首次构建可能需要 3-5 分钟，请耐心等待）"
echo ""
docker-compose up -d --build

echo ""
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo ""
echo "🔍 检查服务状态..."
echo ""
docker-compose ps

echo ""
echo "=== 测试完成 ==="
echo ""

# 获取本地 IP
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)

echo "🌐 访问地址:"
echo "  - 本机: http://localhost"
echo "  - 局域网: http://${LOCAL_IP:-your-ip}"
echo ""
echo "🔑 默认账号:"
echo "  - 管理员凭据来自受保护的 .env 配置"
echo ""
echo "📋 常用命令:"
echo "  - 查看日志: docker-compose logs -f"
echo "  - 停止服务: docker-compose down"
echo "  - 重启服务: docker-compose restart"
echo ""
echo "⚠️  如果无法访问，请等待 30 秒后刷新页面"
echo "   数据库初始化需要一些时间"
echo ""

# 测试 API 连接
echo "🧪 测试 API 连接..."
if curl -s http://localhost/api/auth/me > /dev/null 2>&1; then
    echo "✅ API 服务正常运行"
else
    echo "⏳ API 服务启动中，请稍后再试"
fi
echo ""
