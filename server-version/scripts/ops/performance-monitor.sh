#!/bin/bash
# =============================================================================
# PTool 性能监控系统
# 功能: 数据库慢查询监控、API响应时间分析、资源使用趋势
# 频率: 建议每10分钟运行一次 (crontab)
# =============================================================================

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../monitoring/monitor-config.env"
LOG_DIR="/var/log/ptool/performance"
PERF_LOG="${LOG_DIR}/performance.log"
SLOW_QUERY_LOG="${LOG_DIR}/slow-queries.log"
API_PERF_LOG="${LOG_DIR}/api-performance.log"
TREND_DATA="${LOG_DIR}/trend-data"

# 加载配置
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# 性能阈值
SLOW_QUERY_THRESHOLD=${SLOW_QUERY_THRESHOLD:-1000}     # 慢查询阈值(ms)
API_SLOW_THRESHOLD=${API_SLOW_THRESHOLD:-2000}         # API慢响应阈值(ms)
DB_CONN_WARNING=${DB_CONN_WARNING:-80}                 # 数据库连接数警告(%)
TABLE_BLOAT_THRESHOLD=${TABLE_BLOAT_THRESHOLD:-20}     # 表膨胀阈值(%)

# 颜色输出
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 初始化
init() {
    mkdir -p "$LOG_DIR" "$TREND_DATA"
    touch "$PERF_LOG" "$SLOW_QUERY_LOG" "$API_PERF_LOG"
}

# 日志函数
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1" | tee -a "$PERF_LOG"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $1${NC}" | tee -a "$PERF_LOG"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1${NC}" | tee -a "$PERF_LOG"
}

# 发送性能告警
send_perf_alert() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    if [ "$level" == "CRITICAL" ]; then
        log_error "[$level] $message"
    else
        log_warn "[$level] $message"
    fi
    
    if [ -n "$PERF_WEBHOOK" ]; then
        curl -s -X POST "$PERF_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"type\":\"performance\",\"level\":\"$level\",\"message\":\"$message\",\"timestamp\":\"$timestamp\",\"hostname\":\"$(hostname)\"}" \
            > /dev/null 2>&1 || true
    fi
}

# 检查数据库慢查询
check_slow_queries() {
    log_info "检查数据库慢查询..."
    
    local db_name="${DB_NAME:-ptool}"
    
    # 获取慢查询统计
    local slow_queries
    slow_queries=$(sudo -u postgres psql -d "$db_name" -t -c "
        SELECT query, calls, mean_time, total_time 
        FROM pg_stat_statements 
        WHERE mean_time > $SLOW_QUERY_THRESHOLD 
        ORDER BY mean_time DESC 
        LIMIT 10;
    " 2>/dev/null || echo "")
    
    if [ -n "$slow_queries" ]; then
        log_warn "检测到慢查询:"
        echo "$slow_queries" | while read -r line; do
            log_warn "  $line"
        done
        
        # 记录到慢查询日志
        echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$SLOW_QUERY_LOG"
        echo "$slow_queries" >> "$SLOW_QUERY_LOG"
        echo "" >> "$SLOW_QUERY_LOG"
    fi
    
    # 检查长时间运行的查询
    local long_running
    long_running=$(sudo -u postgres psql -d "$db_name" -t -c "
        SELECT pid, usename, application_name, client_addr, 
               state, query_start, now() - query_start as duration, query
        FROM pg_stat_activity
        WHERE state = 'active' 
        AND query_start < now() - interval '30 seconds'
        AND query NOT LIKE '%pg_stat_activity%'
        ORDER BY query_start;
    " 2>/dev/null || echo "")
    
    if [ -n "$long_running" ]; then
        local count=$(echo "$long_running" | grep -c "^" || echo "0")
        if [ "$count" -gt 0 ]; then
            send_perf_alert "WARNING" "检测到 $count 个长时间运行的查询"
        fi
    fi
}

# 检查数据库性能指标
check_db_performance() {
    log_info "检查数据库性能指标..."
    
    local db_name="${DB_NAME:-ptool}"
    
    # 检查连接数
    local conn_info
    conn_info=$(sudo -u postgres psql -d "$db_name" -t -c "
        SELECT count(*), max_conn 
        FROM pg_stat_activity, 
             (SELECT setting::int as max_conn FROM pg_settings WHERE name = 'max_connections') as mc
        WHERE datname = '$db_name';
    " 2>/dev/null || echo "0 100")
    
    local current_conn=$(echo "$conn_info" | awk '{print $1}')
    local max_conn=$(echo "$conn_info" | awk '{print $2}')
    local conn_percent=$((current_conn * 100 / max_conn))
    
    log_info "数据库连接: $current_conn/$max_conn ($conn_percent%)"
    
    if [ "$conn_percent" -gt "$DB_CONN_WARNING" ]; then
        send_perf_alert "WARNING" "数据库连接数过高: $conn_percent% ($current_conn/$max_conn)"
    fi
    
    # 检查锁等待
    local lock_waits
    lock_waits=$(sudo -u postgres psql -d "$db_name" -t -c "
        SELECT count(*) 
        FROM pg_locks l 
        JOIN pg_stat_activity a ON l.pid = a.pid 
        WHERE NOT l.granted;
    " 2>/dev/null | xargs || echo "0")
    
    if [ "$lock_waits" -gt 5 ]; then
        send_perf_alert "WARNING" "检测到 $lock_waits 个锁等待"
    fi
    
    # 检查表膨胀
    local bloated_tables
    bloated_tables=$(sudo -u postgres psql -d "$db_name" -t -c "
        SELECT schemaname, tablename, 
               pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
               n_dead_tup, n_live_tup,
               round(n_dead_tup::numeric/nullif(n_live_tup,0)*100, 2) as dead_pct
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 1000
        AND n_dead_tup::numeric/nullif(n_live_tup,0) > 0.$TABLE_BLOAT_THRESHOLD
        ORDER BY n_dead_tup DESC
        LIMIT 5;
    " 2>/dev/null || echo "")
    
    if [ -n "$bloated_tables" ]; then
        log_warn "检测到表膨胀:"
        echo "$bloated_tables" | while read -r line; do
            log_warn "  $line"
        done
    fi
    
    # 检查缓存命中率
    local cache_hit
    cache_hit=$(sudo -u postgres psql -d "$db_name" -t -c "
        SELECT round(
            sum(blks_hit) / (sum(blks_hit) + sum(blks_read)) * 100, 2
        ) as cache_hit_ratio
        FROM pg_stat_database
        WHERE datname = '$db_name';
    " 2>/dev/null | xargs || echo "0")
    
    log_info "数据库缓存命中率: ${cache_hit}%"
    
    if (( $(echo "$cache_hit < 95" | bc -l 2>/dev/null || echo "0") )); then
        log_warn "数据库缓存命中率较低: ${cache_hit}%"
    fi
}

# 测试API响应时间
check_api_performance() {
    log_info "检查API响应时间..."
    
    local api_base="${API_URL:-http://localhost:3000}"
    local endpoints=(
        "/health"
        "/api/auth/me"
        "/api/courses"
        "/api/assignments"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local url="${api_base}${endpoint}"
        local response_time
        response_time=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$url" 2>/dev/null || echo "10")
        
        # 转换为毫秒
        local response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null | cut -d. -f1 || echo "10000")
        
        log_info "API $endpoint: ${response_ms}ms"
        
        # 记录到性能日志
        echo "$(date '+%Y-%m-%d %H:%M:%S'),$endpoint,$response_ms" >> "$API_PERF_LOG"
        
        # 检查是否超过阈值
        if [ "$response_ms" -gt "$API_SLOW_THRESHOLD" ]; then
            send_perf_alert "WARNING" "API响应缓慢: $endpoint 耗时 ${response_ms}ms"
        fi
    done
}

# 收集资源使用趋势
collect_resource_trends() {
    log_info "收集资源使用趋势..."
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local date_str=$(date +%Y%m%d)
    
    # CPU使用率
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    cpu_usage=${cpu_usage%.*}
    
    # 内存使用率
    local mem_info=$(free | grep Mem)
    local mem_total=$(echo $mem_info | awk '{print $2}')
    local mem_used=$(echo $mem_info | awk '{print $3}')
    local mem_usage=$((mem_used * 100 / mem_total))
    
    # 磁盘使用率
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    
    # 系统负载
    local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
    
    # 保存趋势数据
    echo "$timestamp,$cpu_usage,$mem_usage,$disk_usage,$load" >> "${TREND_DATA}/resources-${date_str}.csv"
    
    # 只保留最近30天的数据
    find "$TREND_DATA" -name "resources-*.csv" -mtime +30 -delete
}

# 分析性能趋势
analyze_trends() {
    log_info "分析性能趋势..."
    
    local date_str=$(date +%Y%m%d)
    local trend_file="${TREND_DATA}/resources-${date_str}.csv"
    
    if [ ! -f "$trend_file" ] || [ $(wc -l < "$trend_file") -lt 6 ]; then
        log_info "数据不足，无法分析趋势"
        return 0
    fi
    
    # 计算平均CPU使用率
    local avg_cpu
    avg_cpu=$(awk -F',' '{sum+=$2; count++} END {if(count>0) printf "%.1f", sum/count}' "$trend_file")
    
    # 计算平均内存使用率
    local avg_mem
    avg_mem=$(awk -F',' '{sum+=$3; count++} END {if(count>0) printf "%.1f", sum/count}' "$trend_file")
    
    # 计算最大CPU使用率
    local max_cpu
    max_cpu=$(awk -F',' 'NR>1 {if($2>max) max=$2} END {print max}' "$trend_file")
    
    log_info "今日平均CPU使用率: ${avg_cpu}%"
    log_info "今日平均内存使用率: ${avg_mem}%"
    log_info "今日最高CPU使用率: ${max_cpu}%"
    
    # 检查是否需要扩容
    if (( $(echo "$avg_cpu > 70" | bc -l 2>/dev/null || echo "0") )); then
        log_warn "CPU使用率持续较高，建议考虑扩容"
    fi
    
    if (( $(echo "$avg_mem > 80" | bc -l 2>/dev/null || echo "0") )); then
        log_warn "内存使用率持续较高，建议考虑扩容"
    fi
}

# 检查视频处理队列
check_video_queue() {
    log_info "检查视频处理队列..."
    
    # 检查Redis队列长度
    if command -v redis-cli &> /dev/null; then
        local queue_length
        queue_length=$(redis-cli llen "bull:video-processing:wait" 2>/dev/null || echo "0")
        
        log_info "视频处理队列长度: $queue_length"
        
        if [ "$queue_length" -gt 50 ]; then
            send_perf_alert "WARNING" "视频处理队列积压: $queue_length 个任务"
        fi
    fi
    
    # 检查FFmpeg进程数
    local ffmpeg_count
    ffmpeg_count=$(pgrep -c ffmpeg 2>/dev/null || echo "0")
    
    log_info "当前FFmpeg进程数: $ffmpeg_count"
    
    if [ "$ffmpeg_count" -gt 5 ]; then
        log_warn "FFmpeg并发进程较多: $ffmpeg_count"
    fi
}

# 生成性能报告
generate_performance_report() {
    local report_file="${LOG_DIR}/performance-report-$(date +%Y%m%d).json"
    
    # 获取最新指标
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local mem_info=$(free | grep Mem)
    local mem_usage=$(echo $mem_info | awk '{print $3/$2 * 100.0}')
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
    
    # 统计慢查询数量
    local slow_query_count
    slow_query_count=$(grep -c "$(date '+%Y-%m-%d')" "$SLOW_QUERY_LOG" 2>/dev/null || echo "0")
    
    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "metrics": {
        "cpu_usage": ${cpu_usage%.*},
        "memory_usage": ${mem_usage%.*},
        "disk_usage": $disk_usage,
        "load_average": $load
    },
    "database": {
        "slow_queries_today": $slow_query_count
    },
    "recommendations": []
}
EOF
    
    log_info "性能报告已生成: $report_file"
}

# 主函数
main() {
    init
    
    log_info "========== 性能监控开始 =========="
    
    # 执行所有性能检查
    check_slow_queries
    check_db_performance
    check_api_performance
    collect_resource_trends
    analyze_trends
    check_video_queue
    
    # 生成报告
    generate_performance_report
    
    log_info "========== 性能监控完成 =========="
}

# 根据参数执行
case "${1:-run}" in
    run)
        main
        ;;
    db)
        check_slow_queries
        check_db_performance
        ;;
    api)
        check_api_performance
        ;;
    trends)
        collect_resource_trends
        analyze_trends
        ;;
    report)
        generate_performance_report
        cat "${LOG_DIR}/performance-report-$(date +%Y%m%d).json"
        ;;
    *)
        echo "用法: $0 [run|db|api|trends|report]"
        exit 1
        ;;
esac
