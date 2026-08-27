#!/bin/bash
# =============================================================================
# PTool 日志管理系统
# 功能: 日志轮转/归档/分析/清理
# =============================================================================

set -e

cat >&2 <<'NOTICE'
此宿主机日志轮转入口已停用。
请使用 Docker logging/平台日志保留策略；本脚本不会清空宿主机 Nginx、PM2 或应用日志。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_BASE_DIR="/var/log/ptool"
ARCHIVE_DIR="${LOG_BASE_DIR}/archive"
ANALYSIS_DIR="${LOG_BASE_DIR}/analysis"

# 保留配置
RETENTION_DAYS=30           # 日志保留天数
ARCHIVE_DAYS=7              # 几天后归档
MAX_ARCHIVE_SIZE="1G"       # 单个归档最大大小

# 日志源
APP_LOGS=(
    "/var/log/nginx/access.log"
    "/var/log/nginx/error.log"
    "/opt/ptool/server-version/backend/logs"
    "$HOME/.pm2/logs"
)

# 初始化目录
init_dirs() {
    mkdir -p "$LOG_BASE_DIR" "$ARCHIVE_DIR" "$ANALYSIS_DIR"
}

# 日志轮转
rotate_logs() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 执行日志轮转..."
    
    # Nginx日志轮转
    if [ -f /var/log/nginx/access.log ]; then
        # 按日期归档
        local date_str=$(date +%Y%m%d)
        
        # 复制当前日志
        if [ -s /var/log/nginx/access.log ]; then
            cp /var/log/nginx/access.log "${ARCHIVE_DIR}/nginx-access-${date_str}.log"
            > /var/log/nginx/access.log  # 清空原日志
        fi
        
        if [ -s /var/log/nginx/error.log ]; then
            cp /var/log/nginx/error.log "${ARCHIVE_DIR}/nginx-error-${date_str}.log"
            > /var/log/nginx/error.log
        fi
        
        # 通知Nginx重新打开日志文件
        kill -USR1 $(cat /var/run/nginx.pid 2>/dev/null) 2>/dev/null || true
    fi
    
    # PM2日志轮转
    if command -v pm2 &> /dev/null; then
        pm2 flush 2>/dev/null || true
        pm2 reloadLogs 2>/dev/null || true
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 日志轮转完成"
}

# 压缩归档
compress_archives() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 压缩旧日志..."
    
    find "$ARCHIVE_DIR" -name "*.log" -mtime +1 -type f | while read logfile; do
        local gzipfile="${logfile}.gz"
        
        # 如果还没压缩
        if [ ! -f "$gzipfile" ]; then
            gzip -c "$logfile" > "$gzipfile"
            rm -f "$logfile"
            echo "  已压缩: $(basename $logfile)"
        fi
    done
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 压缩完成"
}

# 日志分析
analyze_logs() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 分析日志..."
    
    local today=$(date +%Y%m%d)
    local report_file="${ANALYSIS_DIR}/daily-report-${today}.txt"
    
    cat > "$report_file" << EOF
====================================
PTool 日志分析报告 - $(date '+%Y-%m-%d %H:%M:%S')
====================================

1. 系统资源使用情况
-------------------
$(df -h / | tail -1)
$(free -h | grep Mem)

2. Nginx访问统计
----------------
总请求数: $(cat /var/log/nginx/access.log 2>/dev/null | wc -l)
错误请求(4xx/5xx): $(cat /var/log/nginx/access.log 2>/dev/null | awk '$9 ~ /^[45]/' | wc -l)

3. API错误统计
--------------
$(grep -i "error" /opt/ptool/server-version/backend/logs/*.log 2>/dev/null | wc -l) 个错误

4. 数据库慢查询
--------------
$(sudo -u postgres psql -d ptool -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '1 second';" 2>/dev/null | tail -3 | head -1 | xargs) 个活跃查询

5. 磁盘空间预警
--------------
$(df -h | awk '$5 > 80 {print $0}')

====================================
EOF
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 分析报告已生成: $report_file"
}

# 清理旧日志
cleanup_old_logs() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 清理旧日志..."
    
    # 删除超过保留期的归档
    find "$ARCHIVE_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -type f -delete
    
    # 删除超过保留期的分析报告
    find "$ANALYSIS_DIR" -name "*.txt" -mtime +$RETENTION_DAYS -type f -delete
    
    # 清理系统日志
    journalctl --vacuum-time=${RETENTION_DAYS}d 2>/dev/null || true
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已清理 ${RETENTION_DAYS} 天前的日志"
}

# 实时日志监控
monitor_realtime() {
    echo "启动实时日志监控..."
    echo "按 Ctrl+C 退出"
    echo ""
    
    # 同时监控多个日志源
    tail -f /var/log/nginx/error.log \
          /var/log/ptool/monitoring/alerts.log \
          ~/.pm2/logs/ptool-api-error.log 2>/dev/null || \
    tail -f /var/log/nginx/error.log
}

# 搜索日志
search_logs() {
    local keyword="$1"
    local since="${2:-1h}"
    
    echo "搜索日志关键词: $keyword (最近 $since)"
    echo ""
    
    # 在多个日志源中搜索
    grep -r "$keyword" /var/log/nginx/ 2>/dev/null | head -20
    grep -r "$keyword" /opt/ptool/server-version/backend/logs/ 2>/dev/null | head -20
    grep -r "$keyword" /var/log/ptool/monitoring/ 2>/dev/null | head -20
}

# 主函数
main() {
    init_dirs
    
    case "${1:-daily}" in
        daily)
            rotate_logs
            compress_archives
            analyze_logs
            cleanup_old_logs
            ;;
        rotate)
            rotate_logs
            ;;
        compress)
            compress_archives
            ;;
        analyze)
            analyze_logs
            ;;
        cleanup)
            cleanup_old_logs
            ;;
        monitor)
            monitor_realtime
            ;;
        search)
            search_logs "$2" "$3"
            ;;
        *)
            echo "用法: $0 [daily|rotate|compress|analyze|cleanup|monitor|search <keyword>]"
            exit 1
            ;;
    esac
}

main "$@"
LEGACY_SCRIPT
