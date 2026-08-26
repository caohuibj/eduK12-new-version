#!/bin/bash
# =============================================================================
# PTool 系统健康监控脚本
# 功能: CPU/内存/磁盘/服务状态监控 + 告警
# 频率: 建议每5分钟运行一次 (crontab)
# =============================================================================

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/monitor-config.env"
LOG_DIR="/var/log/ptool/monitoring"
ALERT_LOG="${LOG_DIR}/alerts.log"
HEALTH_LOG="${LOG_DIR}/health.log"

# 告警阈值
CPU_THRESHOLD=${CPU_THRESHOLD:-80}          # CPU使用率告警阈值
MEM_THRESHOLD=${MEM_THRESHOLD:-85}          # 内存使用率告警阈值
DISK_THRESHOLD=${DISK_THRESHOLD:-90}        # 磁盘使用率告警阈值
LOAD_THRESHOLD=${LOAD_THRESHOLD:-4}         # 负载告警阈值(2核)
CONN_THRESHOLD=${CONN_THRESHOLD:-15}        # 数据库连接数告警

# 服务配置
API_URL=${API_URL:-"http://localhost"}
API_TIMEOUT=${API_TIMEOUT:-10}
DB_NAME=${DB_NAME:-"ptool"}
DB_USER=${DB_USER:-"ptool"}
POSTGRES_CONTAINER=${POSTGRES_CONTAINER:-"ptool-postgres"}
REDIS_CONTAINER=${REDIS_CONTAINER:-"ptool-redis"}
FRONTEND_CONTAINER=${FRONTEND_CONTAINER:-"ptool-frontend"}

# 加载自定义配置
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# 颜色输出
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# 初始化日志目录
init_logs() {
    mkdir -p "$LOG_DIR"
    touch "$ALERT_LOG" "$HEALTH_LOG"
}

# 日志函数
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1" | tee -a "$HEALTH_LOG"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $1${NC}" | tee -a "$ALERT_LOG"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1${NC}" | tee -a "$ALERT_LOG"
}

# 发送告警 (使用统一告警脚本)
send_alert() {
    local level="$1"
    local message="$2"
    local title="${3:-系统健康告警}"
    
    # 1. 记录到日志
    if [ "$level" == "CRITICAL" ]; then
        log_error "[$level] $message"
    else
        log_warn "[$level] $message"
    fi
    
    # 2. 使用统一告警脚本发送到所有配置渠道
    local alert_script="${SCRIPT_DIR}/send-alert.sh"
    if [ -x "$alert_script" ]; then
        "$alert_script" send "$level" "$title" "$message" "health" 2>/dev/null || true
    fi
    
    # 3. 写入系统日志
    logger -t ptool-monitor "[$level] $message"
}

# 检查CPU使用率
check_cpu() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    cpu_usage=${cpu_usage%.*}  # 取整数
    
    log_info "CPU使用率: ${cpu_usage}%"
    
    if [ "$cpu_usage" -gt "$CPU_THRESHOLD" ]; then
        send_alert "WARNING" "CPU使用率过高: ${cpu_usage}% (阈值: ${CPU_THRESHOLD}%)"
        return 1
    fi
    return 0
}

# 检查内存使用率
check_memory() {
    local mem_info=$(free | grep Mem)
    local total=$(echo $mem_info | awk '{print $2}')
    local used=$(echo $mem_info | awk '{print $3}')
    local mem_usage=$((used * 100 / total))
    
    log_info "内存使用率: ${mem_usage}% (${used}/${total} KB)"
    
    if [ "$mem_usage" -gt "$MEM_THRESHOLD" ]; then
        send_alert "WARNING" "内存使用率过高: ${mem_usage}% (阈值: ${MEM_THRESHOLD}%)"
        return 1
    fi
    return 0
}

# 检查磁盘使用率
check_disk() {
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    
    log_info "磁盘使用率: ${disk_usage}%"
    
    if [ "$disk_usage" -gt "$DISK_THRESHOLD" ]; then
        send_alert "CRITICAL" "磁盘使用率过高: ${disk_usage}% (阈值: ${DISK_THRESHOLD}%)"
        return 1
    fi
    return 0
}

# 检查系统负载
check_load() {
    local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
    local load_int=${load%.*}
    
    log_info "系统负载: $load"
    
    if [ "${load_int:-0}" -gt "$LOAD_THRESHOLD" ]; then
        send_alert "WARNING" "系统负载过高: $load (阈值: $LOAD_THRESHOLD)"
        return 1
    fi
    return 0
}

# 检查API服务
check_api() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$API_TIMEOUT" "${API_URL}/health" 2>/dev/null || echo "000")
    
    log_info "API健康检查: HTTP $http_code"
    
    if [ "$http_code" != "200" ]; then
        send_alert "CRITICAL" "API服务异常: HTTP $http_code"
        return 1
    fi
    return 0
}

# 检查数据库连接
check_database() {
    local conn_count
    if ! docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
        send_alert "CRITICAL" "PostgreSQL 容器不存在: $POSTGRES_CONTAINER"
        return 1
    fi
    if ! conn_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname = '$DB_NAME';" 2>/dev/null); then
        send_alert "CRITICAL" "PostgreSQL 查询失败"
        return 1
    fi
    conn_count=$(echo "$conn_count" | xargs)
    
    log_info "数据库连接数: $conn_count"
    
    if [ "${conn_count:-0}" -gt "$CONN_THRESHOLD" ]; then
        send_alert "WARNING" "数据库连接数过多: $conn_count (阈值: $CONN_THRESHOLD)"
        return 1
    fi
    return 0
}

# 检查Redis
check_redis() {
    local redis_ping
    redis_ping=$(docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null || echo "FAILED")

    log_info "Redis状态: $redis_ping"

    if [ "$redis_ping" != "PONG" ]; then
        send_alert "CRITICAL" "Redis服务异常"
        return 1
    fi
    return 0
}

# 检查Nginx
check_nginx() {
    local frontend_status
    frontend_status=$(docker inspect --format '{{.State.Health.Status}}' "$FRONTEND_CONTAINER" 2>/dev/null || echo "unknown")

    log_info "前端容器状态: $frontend_status"

    if [ "$frontend_status" != "healthy" ]; then
        send_alert "CRITICAL" "前端容器异常: $frontend_status"
        return 1
    fi
    return 0
}

# 检查SSL证书过期
check_ssl() {
    local domain="${DOMAIN:-}"
    if [ -z "$domain" ]; then
        return 0
    fi
    
    local cert_expiry
    cert_expiry=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null | openssl x509 -noout -dates | grep notAfter | cut -d= -f2)
    
    if [ -n "$cert_expiry" ]; then
        local expiry_timestamp=$(date -d "$cert_expiry" +%s)
        local current_timestamp=$(date +%s)
        local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
        
        log_info "SSL证书过期时间: $days_until_expiry 天后"
        
        if [ "$days_until_expiry" -lt 7 ]; then
            send_alert "CRITICAL" "SSL证书即将过期: $days_until_expiry 天后"
            return 1
        elif [ "$days_until_expiry" -lt 30 ]; then
            send_alert "WARNING" "SSL证书将在 $days_until_expiry 天后过期"
            return 1
        fi
    fi
    return 0
}

# 生成健康报告
generate_report() {
    local report_file="${LOG_DIR}/health-report-$(date +%Y%m%d).json"
    
    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "checks": {
        "cpu": {"threshold": $CPU_THRESHOLD, "status": "$(check_cpu && echo 'OK' || echo 'FAIL')"},
        "memory": {"threshold": $MEM_THRESHOLD, "status": "$(check_memory && echo 'OK' || echo 'FAIL')"},
        "disk": {"threshold": $DISK_THRESHOLD, "status": "$(check_disk && echo 'OK' || echo 'FAIL')"},
        "load": {"threshold": $LOAD_THRESHOLD, "status": "$(check_load && echo 'OK' || echo 'FAIL')"},
        "api": {"status": "$(check_api && echo 'OK' || echo 'FAIL')"},
        "database": {"status": "$(check_database && echo 'OK' || echo 'FAIL')"},
        "redis": {"status": "$(check_redis && echo 'OK' || echo 'N/A')"},
        "nginx": {"status": "$(check_nginx && echo 'OK' || echo 'FAIL')"}
    }
}
EOF
    
    log_info "健康报告已生成: $report_file"
}

# 清理旧日志
cleanup_logs() {
    # 清理30天前的健康报告JSON（非持续写入文件，find -mtime 有效）
    find "$LOG_DIR" -name "health-report-*.json" -mtime +30 -delete

    # 兜底：按大小截断超大日志文件（logrotate 已接管轮转，此处为安全兜底）
    local max_log_size=$((20 * 1024 * 1024))  # 20MB
    for logfile in "$LOG_DIR"/*.log; do
        [ -f "$logfile" ] || continue
        local size
        size=$(stat -c%s "$logfile" 2>/dev/null || echo 0)
        if [ "$size" -gt "$max_log_size" ]; then
            tail -2000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
            log_info "日志兜底截断: $(basename "$logfile") (原 ${size} 字节，截断至尾部2000行)"
        fi
    done

    log_info "日志清理完成"
}

# 主函数
main() {
    init_logs
    
    log_info "========== 开始健康检查 =========="
    
    local failed=0
    
    # 执行所有检查
    check_cpu || ((failed++))
    check_memory || ((failed++))
    check_disk || ((failed++))
    check_load || ((failed++))
    check_api || ((failed++))
    check_database || ((failed++))
    check_redis || true  # Redis可选
    check_nginx || ((failed++))
    check_ssl || true  # SSL可选
    
    # 生成报告
    generate_report
    
    # 清理日志
    cleanup_logs
    
    log_info "========== 健康检查完成 (失败: $failed) =========="
    
    # 如果有严重错误，返回非0退出码
    if [ "$failed" -gt 0 ]; then
        exit 1
    fi
    
    exit 0
}

# 根据参数执行不同操作
case "${1:-run}" in
    run)
        main
        ;;
    check)
        # 只检查，不告警
        check_cpu && check_memory && check_disk && check_api
        ;;
    report)
        generate_report
        cat "${LOG_DIR}/health-report-$(date +%Y%m%d).json"
        ;;
    test-alert)
        send_alert "TEST" "这是一条测试告警消息"
        echo "测试告警已发送"
        ;;
    *)
        echo "用法: $0 [run|check|report|test-alert]"
        exit 1
        ;;
esac
