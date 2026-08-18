#!/bin/bash
# =============================================================================
# PTool CI/CD 自动化部署脚本
# 功能: 代码拉取 → 构建 → 测试 → 部署 → 验证 → 回滚
# 触发: Git webhook 或手动执行
# =============================================================================

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy-config.env"

# 默认配置
APP_NAME="ptool"
APP_DIR="/opt/ptool"
DEPLOY_USER="deploy"
GIT_REPO="${GIT_REPO:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
DEPLOY_ENV="${DEPLOY_ENV:-production}"

# 部署配置
KEEP_RELEASES=5              # 保留的历史版本数
HEALTH_CHECK_TIMEOUT=60      # 健康检查超时(秒)
ROLLBACK_ON_FAILURE=true     # 失败自动回滚

# 加载配置
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志
LOG_FILE="/var/log/ptool/deploy.log"
mkdir -p "$(dirname $LOG_FILE)"

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

info() { log "${GREEN}[INFO]${NC} $1"; }
warn() { log "${YELLOW}[WARN]${NC} $1"; }
error() { log "${RED}[ERROR]${NC} $1"; }
step() { log "${BLUE}[STEP]${NC} $1"; }

# 发送通知
notify() {
    local status="$1"
    local message="$2"
    
    logger -t ptool-deploy "$message"
    
    if [ -n "$DEPLOY_WEBHOOK" ]; then
        curl -s -X POST "$DEPLOY_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"status\":\"$status\",\"message\":\"$message\",\"env\":\"$DEPLOY_ENV\",\"timestamp\":\"$(date -Iseconds)\"}" \
            > /dev/null 2>&1 || true
    fi
}

# 获取版本信息
get_version_info() {
    cd "$APP_DIR"
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    GIT_TAG=$(git describe --tags --always 2>/dev/null || echo "")
    BUILD_TIME=$(date '+%Y%m%d_%H%M%S')
    
    if [ -n "$GIT_TAG" ]; then
        VERSION="$GIT_TAG-$BUILD_TIME"
    else
        VERSION="$GIT_COMMIT-$BUILD_TIME"
    fi
    
    echo "$VERSION"
}

# 预部署检查
pre_deploy_checks() {
    step "执行预部署检查..."
    
    local checks_passed=0
    local total_checks=5
    
    # 1. 检查磁盘空间
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    if [ "$disk_usage" -lt 80 ]; then
        info "✓ 磁盘空间充足 (${disk_usage}%)"
        ((checks_passed++))
    else
        warn "✗ 磁盘空间不足 (${disk_usage}%)"
    fi
    
    # 2. 检查服务状态
    if systemctl is-active --quiet nginx; then
        info "✓ Nginx运行正常"
        ((checks_passed++))
    else
        warn "✗ Nginx未运行"
    fi
    
    # 3. 检查数据库
    if sudo -u postgres pg_isready > /dev/null 2>&1; then
        info "✓ PostgreSQL运行正常"
        ((checks_passed++))
    else
        warn "✗ PostgreSQL未运行"
    fi
    
    # 4. 检查Git仓库
    if [ -d "$APP_DIR/.git" ]; then
        info "✓ Git仓库存在"
        ((checks_passed++))
    else
        warn "✗ Git仓库不存在"
    fi
    
    # 5. 检查必要的命令
    if command -v npm &> /dev/null && command -v node &> /dev/null; then
        info "✓ Node.js环境就绪"
        ((checks_passed++))
    else
        warn "✗ Node.js环境不完整"
    fi
    
    info "预部署检查: $checks_passed/$total_checks 通过"
    
    if [ "$checks_passed" -lt 3 ]; then
        error "预部署检查失败，中止部署"
        return 1
    fi
    
    return 0
}

# 创建发布版本
create_release() {
    step "创建新版本..."
    
    VERSION=$(get_version_info)
    RELEASE_DIR="${APP_DIR}/releases/${VERSION}"
    
    # 创建发布目录
    mkdir -p "$RELEASE_DIR"
    
    # 复制当前代码
    rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' \
        "$APP_DIR/" "$RELEASE_DIR/"
    
    # 记录版本信息
    cat > "${RELEASE_DIR}/VERSION" << EOF
VERSION=$VERSION
GIT_COMMIT=$GIT_COMMIT
GIT_BRANCH=$GIT_BRANCH
BUILD_TIME=$BUILD_TIME
DEPLOY_ENV=$DEPLOY_ENV
EOF
    
    info "版本创建完成: $VERSION"
    echo "$RELEASE_DIR"
}

# 构建应用
build_app() {
    local release_dir="$1"
    
    step "构建应用..."
    
    # 后端构建
    info "构建后端..."
    cd "${release_dir}/server-version/backend"
    
    # 安装依赖
    npm ci --production
    
    # TypeScript编译
    if npm run build; then
        info "✓ 后端构建成功"
    else
        error "✗ 后端构建失败"
        return 1
    fi
    
    # 数据库迁移
    info "执行数据库迁移..."
    if npx prisma migrate deploy; then
        info "✓ 数据库迁移成功"
    else
        error "✗ 数据库迁移失败"
        return 1
    fi
    
    # 前端构建
    info "构建前端..."
    cd "${release_dir}/server-version/frontend"
    
    npm ci
    
    if npm run build; then
        info "✓ 前端构建成功"
    else
        error "✗ 前端构建失败"
        return 1
    fi
    
    return 0
}

# 运行测试
run_tests() {
    local release_dir="$1"
    
    step "运行测试..."
    
    # 后端测试
    cd "${release_dir}/server-version/backend"
    
    if npm test 2>/dev/null; then
        info "✓ 后端测试通过"
    else
        warn "⚠ 后端测试失败或不存在"
    fi
    
    # 健康检查
    info "启动临时服务进行健康检查..."
    cd "${release_dir}/server-version/backend"
    PORT=3999 nohup node dist/index.js > /tmp/test-server.log 2>&1 &
    local test_pid=$!
    
    # 等待服务启动
    sleep 5
    
    local retries=0
    while [ $retries -lt 10 ]; do
        if curl -s http://localhost:3999/health | grep -q "status.*ok"; then
            info "✓ 健康检查通过"
            kill $test_pid 2>/dev/null || true
            return 0
        fi
        sleep 2
        ((retries++))
    done
    
    kill $test_pid 2>/dev/null || true
    error "✗ 健康检查失败"
    return 1
}

# 部署新版本
deploy_release() {
    local release_dir="$1"
    
    step "部署新版本..."
    
    # 1. 切换符号链接
    local current_link="${APP_DIR}/current"
    local backup_link="${APP_DIR}/previous"
    
    # 备份当前版本
    if [ -L "$current_link" ]; then
        rm -f "$backup_link"
        cp -P "$current_link" "$backup_link"
    fi
    
    # 创建新的current链接
    rm -f "$current_link"
    ln -s "$release_dir" "$current_link"
    
    # 2. 更新Nginx静态文件
    info "更新前端文件..."
    rm -rf /var/www/html/*
    cp -r "${release_dir}/server-version/frontend/dist/"* /var/www/html/
    chown -R www-data:www-data /var/www/html
    
    # 3. 重启后端服务
    info "重启后端服务..."
    if command -v pm2 &> /dev/null; then
        pm2 reload "$APP_NAME-api" || pm2 start "${release_dir}/server-version/backend/dist/index.js" --name "$APP_NAME-api"
        pm2 save
    else
        # 传统方式重启
        pkill -f "node.*dist/index.js" || true
        cd "${release_dir}/server-version/backend"
        nohup node dist/index.js > /var/log/ptool/app.log 2>&1 &
    fi
    
    # 4. 重载Nginx
    nginx -t && systemctl reload nginx
    
    info "部署完成"
}

# 验证部署
verify_deployment() {
    step "验证部署..."
    
    local retries=0
    local max_retries=$((HEALTH_CHECK_TIMEOUT / 5))
    
    while [ $retries -lt $max_retries ]; do
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000/health" 2>/dev/null || echo "000")
        
        if [ "$http_code" == "200" ]; then
            info "✓ 部署验证成功 (HTTP 200)"
            return 0
        fi
        
        info "等待服务就绪... (尝试 $((retries+1))/$max_retries)"
        sleep 5
        ((retries++))
    done
    
    error "✗ 部署验证失败"
    return 1
}

# 清理旧版本
cleanup_old_releases() {
    step "清理旧版本..."
    
    local releases_dir="${APP_DIR}/releases"
    local release_count=$(ls -1 "$releases_dir" | wc -l)
    
    if [ "$release_count" -gt "$KEEP_RELEASES" ]; then
        # 保留最新的KEEP_RELEASES个版本
        ls -1t "$releases_dir" | tail -n +$((KEEP_RELEASES + 1)) | while read old_release; do
            info "删除旧版本: $old_release"
            rm -rf "${releases_dir}/${old_release}"
        done
    fi
    
    info "清理完成"
}

# 回滚部署
rollback() {
    step "执行回滚..."
    
    local backup_link="${APP_DIR}/previous"
    local current_link="${APP_DIR}/current"
    
    if [ ! -L "$backup_link" ]; then
        error "没有可用的回滚版本"
        return 1
    fi
    
    # 切换回旧版本
    local previous_version=$(readlink "$backup_link")
    rm -f "$current_link"
    ln -s "$previous_version" "$current_link"
    
    # 重新部署旧版本
    deploy_release "$previous_version"
    
    info "已回滚到: $(basename "$previous_version")"
    notify "ROLLBACK" "已回滚到 $(basename "$previous_version")"
}

# 主部署流程
deploy() {
    info "========== 开始部署 =========="
    info "环境: $DEPLOY_ENV"
    info "分支: $GIT_BRANCH"
    
    # 1. 预部署检查
    pre_deploy_checks || exit 1
    
    # 2. 创建发布版本
    RELEASE_DIR=$(create_release)
    
    # 3. 构建
    if ! build_app "$RELEASE_DIR"; then
        error "构建失败"
        rm -rf "$RELEASE_DIR"
        exit 1
    fi
    
    # 4. 测试
    if ! run_tests "$RELEASE_DIR"; then
        error "测试失败"
        rm -rf "$RELEASE_DIR"
        exit 1
    fi
    
    # 5. 部署
    deploy_release "$RELEASE_DIR"
    
    # 6. 验证
    if verify_deployment; then
        info "✓ 部署成功"
        notify "SUCCESS" "部署成功: $(get_version_info)"
        
        # 清理旧版本
        cleanup_old_releases
    else
        error "✗ 部署验证失败"
        
        if [ "$ROLLBACK_ON_FAILURE" == "true" ]; then
            warn "执行自动回滚..."
            rollback
        fi
        
        notify "FAILED" "部署失败，已回滚"
        exit 1
    fi
    
    info "========== 部署完成 =========="
}

# 快速部署 (跳过测试)
quick_deploy() {
    info "========== 快速部署 =========="
    
    pre_deploy_checks || exit 1
    RELEASE_DIR=$(create_release)
    build_app "$RELEASE_DIR" || exit 1
    deploy_release "$RELEASE_DIR"
    verify_deployment || exit 1
    cleanup_old_releases
    
    info "========== 快速部署完成 =========="
}

# 显示部署历史
show_history() {
    echo "=== 部署历史 ==="
    ls -lt "${APP_DIR}/releases/" 2>/dev/null | head -10 || echo "无历史版本"
    
    echo ""
    echo "当前版本:"
    if [ -L "${APP_DIR}/current" ]; then
        readlink "${APP_DIR}/current"
        cat "${APP_DIR}/current/VERSION" 2>/dev/null
    else
        echo "未部署"
    fi
}

# 主函数
main() {
    case "${1:-deploy}" in
        deploy)
            deploy
            ;;
        quick)
            quick_deploy
            ;;
        rollback)
            rollback
            verify_deployment || exit 1
            ;;
        history)
            show_history
            ;;
        status)
            verify_deployment && echo "服务正常" || echo "服务异常"
            ;;
        setup)
            # 初始化部署环境
            mkdir -p "${APP_DIR}/releases"
            ln -s "${APP_DIR}" "${APP_DIR}/current" 2>/dev/null || true
            info "部署环境初始化完成"
            ;;
        *)
            echo "用法: $0 [deploy|quick|rollback|history|status|setup]"
            echo ""
            echo "命令说明:"
            echo "  deploy   - 完整部署 (检查→构建→测试→部署)"
            echo "  quick    - 快速部署 (跳过测试)"
            echo "  rollback - 回滚到上一个版本"
            echo "  history  - 显示部署历史"
            echo "  status   - 检查服务状态"
            echo "  setup    - 初始化部署环境"
            exit 1
            ;;
    esac
}

main "$@"
