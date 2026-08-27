#!/bin/bash
# 快速部署脚本 - 构建并部署前端，刷新 CDN
# 使用方法: ./quick-deploy-frontend.sh [--skip-cdn]

set -Eeuo pipefail

cat >&2 <<'NOTICE'
此宿主机前端快速部署脚本已停用。
生产前端必须作为 server-version/docker-compose.yml 的 frontend 服务发布，
请使用 Compose 的构建/更新流程，并通过前端容器健康检查确认发布结果。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SKIP_CDN=false

# 解析参数
for arg in "$@"; do
    case $arg in
        --skip-cdn)
            SKIP_CDN=true
            shift
            ;;
    esac
done

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

echo "========================================"
echo "  PTool 前端快速部署"
echo "========================================"
echo ""

# 1. 构建前端
build_frontend() {
    print_step "1/3 构建前端..."
    
    cd "$FRONTEND_DIR"
    
    # 检查是否有变化
    if [ -d "dist" ]; then
        print_info "清理旧构建..."
        rm -rf dist
    fi
    
    print_info "执行构建..."
    npm run build
    
    # 显示构建结果
    local js_file=$(ls dist/assets/index*.js 2>/dev/null | head -1)
    if [ -n "$js_file" ]; then
        local js_hash=$(basename "$js_file" | sed 's/index-\([^.]*\).js/\1/')
        print_info "构建完成: index-$js_hash.js"
    else
        print_error "构建失败: 未找到输出文件"
        exit 1
    fi
}

# 2. 部署 (当前服务器已经是生产环境，文件已在正确位置)
deploy() {
    print_step "2/3 部署..."
    
    # Nginx 已经配置指向 dist 目录
    # 只需要重载 Nginx 确保最新
    if command -v nginx &> /dev/null; then
        print_info "重载 Nginx..."
        sudo nginx -t && sudo systemctl reload nginx
    else
        print_warn "Nginx 未安装，跳过重载"
    fi
    
    print_info "部署完成"
}

# 3. 刷新 CDN
refresh_cdn() {
    print_step "3/3 刷新 CDN..."
    
    if [ "$SKIP_CDN" = true ]; then
        print_warn "跳过 CDN 刷新 (--skip-cdn)"
        return 0
    fi
    
    if [ -f "$SCRIPT_DIR/refresh-cdn.sh" ]; then
        "$SCRIPT_DIR/refresh-cdn.sh" frontend
    else
        print_warn "未找到 refresh-cdn.sh，跳过 CDN 刷新"
    fi
}

# 主流程
main() {
    build_frontend
    deploy
    refresh_cdn
    
    echo ""
    echo "========================================"
    echo -e "${GREEN}  部署完成!${NC}"
    echo "========================================"
    echo ""
    echo "访问: https://eduk12.top"
    echo ""
}

main

LEGACY_SCRIPT
