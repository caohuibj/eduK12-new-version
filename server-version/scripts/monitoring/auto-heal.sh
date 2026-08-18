#!/bin/bash
# =============================================================================
# PTool 自动恢复系统
# 功能: 服务故障自动检测与恢复
# 触发: 每分钟运行一次 (crontab)
# =============================================================================

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/ptool/monitoring/auto-heal.log"
LOCK_FILE="/tmp/ptool-auto-heal.lock"
MAX_RESTARTS=3              # 最大重启次数
RESTART_WINDOW=300          # 重启窗口(秒)
HEALING_COOLDOWN=60         # 恢复后冷却时间

# 服务配置
API_SERVICE="ptool-backend"
API_PORT=3001
API_CHECK_URL="http://localhost:${API_PORT}/health"
NGINX_SERVICE="nginx"
REDIS_SERVICE="redis"
POSTGRES_SERVICE="postgresql"

# 初始化
init() {
    mkdir -p "$(dirname $LOG_FILE)"
    touch "$LOG_FILE"
}

# 日志
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 发送通知
notify() {
    local message="$1"
    logger -t ptool-auto-heal "$message"
    
    # 如果配置了webhook
    if [ -n "$HEAL_WEBHOOK" ]; then
        curl -s -X POST "$HEAL_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"event\":\"auto-heal\",\"message\":\"$message\",\"timestamp\":\"$(date -Iseconds)\"}" \
            > /dev/null 2>&1 || true
    fi
}

# 检查服务状态
check_service() {
    local service="$1"
    systemctl is-active "$service" > /dev/null 2>&1
}

# 检查API健康
check_api_health() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_CHECK_URL" 2>/dev/null || echo "000")
    [ "$http_code" == "200" ]
}

# 检查端口
 check_port() {
    local port="$1"
    nc -z localhost "$port" > /dev/null 2>&1
}

# 记录重启次数
record_restart() {
    local service="$1"
    local restart_file="/tmp/ptool-restarts-${service}"
    local now=$(date +%s)
    
    # 读取历史重启记录
    local restarts=()
    if [ -f "$restart_file" ]; then
        while read -r timestamp; do
            if [ $((now - timestamp)) -lt $RESTART_WINDOW ]; then
                restarts+=("$timestamp")
            fi
        done < "$restart_file"
    fi
    
    # 添加本次重启
    restarts+=("$now")
    
    # 保存记录
    printf '%s\n' "${restarts[@]}" > "$restart_file"
    
    # 返回重启次数
    echo "${#restarts[@]}"
}

# 获取重启次数
get_restart_count() {
    local service="$1"
    local restart_file="/tmp/ptool-restarts-${service}"
    local now=$(date +%s)
    local count=0
    
    if [ -f "$restart_file" ]; then
        while read -r timestamp; do
            if [ $((now - timestamp)) -lt $RESTART_WINDOW ]; then
                ((count++))
            fi
        done < "$restart_file"
    fi
    
    echo "$count"
}

# 重启服务
restart_service() {
    local service="$1"
    local restart_count
    
    restart_count=$(get_restart_count "$service")
    
    if [ "$restart_count" -ge "$MAX_RESTARTS" ]; then
        log "警告: $service 在${RESTART_WINDOW}秒内重启超过${MAX_RESTARTS}次，放弃自动恢复"
        notify "严重: $service 频繁重启，需要人工介入"
        return 1
    fi
    
    log "正在重启 $service (第 $((restart_count + 1)) 次)..."
    
    case "$service" in
        "ptool-api")
            # PM2管理的服务
            if command -v pm2 &> /dev/null; then
                pm2 restart "$API_SERVICE" 2>&1 | tee -a "$LOG_FILE"
            else
                # 直接启动
                cd /opt/ptool/server-version/backend
                nohup npm start > /tmp/ptool-api.log 2>&1 &
            fi
            ;;
        "nginx"|"redis"|"postgresql")
            systemctl restart "$service"
            ;;
    esac
    
    # 记录重启
    record_restart "$service"
    
    # 等待服务启动
    sleep 5
    
    # 验证恢复
    if verify_service "$service"; then
        log "$service 重启成功"
        notify "$service 自动恢复成功"
        return 0
    else
        log "$service 重启失败"
        return 1
    fi
}

# 验证服务
verify_service() {
    local service="$1"
    
    case "$service" in
        "ptool-api")
            check_api_health
            ;;
        "nginx")
            check_service "$NGINX_SERVICE"
            ;;
        "redis")
            redis-cli ping > /dev/null 2>&1
            ;;
        "postgresql")
            sudo -u postgres pg_isready > /dev/null 2>&1
            ;;
        *)
            check_service "$service"
            ;;
    esac
}

# 修复常见问题
fix_common_issues() {
    log "检查并修复常见问题..."
    
    # 1. 磁盘空间不足
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    if [ "$disk_usage" -gt 90 ]; then
        log "磁盘空间不足 (${disk_usage}%)，清理日志..."
        # 清理日志
        find /var/log -name "*.log" -mtime +7 -type f -delete 2>/dev/null || true
        find /tmp -name "*.log" -mtime +3 -type f -delete 2>/dev/null || true
        # 清理npm缓存
        npm cache clean --force 2>/dev/null || true
        log "日志清理完成"
    fi
    
    # 2. 内存不足
    local mem_usage=$(free | grep Mem | awk '{print $3/$2 * 100.0}' | cut -d. -f1)
    if [ "$mem_usage" -gt 90 ]; then
        log "内存使用率高 (${mem_usage}%)，清理缓存..."
        # 清理内存缓存
        sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
        # 重启PM2服务释放内存
        if command -v pm2 &> /dev/null; then
            pm2 reload all 2>/dev/null || true
        fi
        log "内存清理完成"
    fi
    
    # 3. 僵尸进程
    local zombie_count=$(ps aux | grep -c "<defunct>")
    if [ "$zombie_count" -gt 5 ]; then
        log "发现 $zombie_count 个僵尸进程，清理中..."
        kill -HUP 1 2>/dev/null || true
        log "僵尸进程清理完成"
    fi
    
    # 4. 检查并修复权限
    # 注意：PM2 以 ubuntu 用户运行，上传目录需要 ubuntu 权限
    if [ -d "/opt/ptool" ]; then
        local uploads_dir="/opt/ptool/server-version/backend/uploads"
        if [ -d "$uploads_dir" ]; then
            chown -R ubuntu:ubuntu "$uploads_dir" 2>/dev/null || true
        fi
    fi
}

# 执行健康检查和恢复
heal_services() {
    local issues_found=0
    
    # 1. 检查Nginx
    if ! check_service "$NGINX_SERVICE"; then
        log "Nginx 服务异常"
        restart_service "$NGINX_SERVICE" || ((issues_found++))
    fi
    
    # 2. 检查PostgreSQL
    if ! check_service "$POSTGRES_SERVICE"; then
        log "PostgreSQL 服务异常"
        restart_service "$POSTGRES_SERVICE" || ((issues_found++))
    fi
    
    # 3. 检查Redis
    if command -v redis-cli &> /dev/null; then
        if ! redis-cli ping > /dev/null 2>&1; then
            log "Redis 服务异常"
            restart_service "$REDIS_SERVICE" || ((issues_found++))
        fi
    fi
    
    # 4. 检查API服务
    if ! check_api_health; then
        log "API 服务异常"
        restart_service "ptool-api" || ((issues_found++))
    fi
    
    # 修复常见问题
    fix_common_issues
    
    return $issues_found
}

# 主函数
main() {
    # 防止并发执行
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "另一个自动恢复进程正在运行 (PID: $pid)，退出"
            exit 0
        fi
    fi
    
    echo $$ > "$LOCK_FILE"
    trap "rm -f $LOCK_FILE" EXIT
    
    init
    
    log "========== 自动恢复检查开始 =========="
    
    heal_services
    local result=$?
    
    log "========== 自动恢复检查完成 =========="
    
    return $result
}

# 根据参数执行
case "${1:-heal}" in
    heal)
        main
        ;;
    check)
        # 只检查，不恢复
        check_api_health && echo "API正常" || echo "API异常"
        check_service "$NGINX_SERVICE" && echo "Nginx正常" || echo "Nginx异常"
        ;;
    fix)
        # 只修复常见问题
        init
        fix_common_issues
        ;;
    *)
        echo "用法: $0 [heal|check|fix]"
        exit 1
        ;;
esac
