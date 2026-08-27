#!/bin/bash
# =============================================================================
# PTool 运维 Dashboard (CLI版)
# 功能: 实时显示系统状态、服务健康、关键指标
# 使用: 交互式命令行仪表盘
# =============================================================================

set -e

cat >&2 <<'NOTICE'
此宿主机运维 Dashboard 已停用。
它原先会读取宿主机 PostgreSQL/Redis、PM2 和 systemd，并提供重启动作；这些路径不再受支持。
请使用 server-version/docker-compose.monitoring.yml 的 Prometheus、Grafana 和 Alertmanager。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'
BOLD='\033[1m'

# 清屏并定位光标
clear_screen() {
    printf "\033[2J\033[H"
}

# 绘制分隔线
draw_line() {
    local char="${1:-─}"
    local cols=$(tput cols)
    printf "%${cols}s\n" "" | tr " " "$char"
}

# 绘制标题
draw_header() {
    local title="$1"
    local cols=$(tput cols)
    local padding=$(( (cols - ${#title}) / 2 ))
    printf "\n${BOLD}${WHITE}%${padding}s%s%${padding}s${NC}\n" "" "$title" ""
    draw_line "═"
}

# 绘制卡片
draw_card() {
    local title="$1"
    local content="$2"
    local status="${3:-normal}"
    
    local color="$WHITE"
    case "$status" in
        ok) color="$GREEN" ;;
        warn) color="$YELLOW" ;;
        error) color="$RED" ;;
    esac
    
    echo -e "${BOLD}${color}┌─ $title ─┐${NC}"
    echo -e "$content"
    echo -e "${color}└$(printf '%*s' $((${#title}+4)) '' | tr ' ' '─')┘${NC}"
    echo ""
}

# 获取系统信息
get_system_info() {
    # CPU
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | xargs printf "%.1f")
    
    # 内存
    local mem_info=$(free | grep Mem)
    local mem_total=$(echo $mem_info | awk '{print $2}')
    local mem_used=$(echo $mem_info | awk '{print $3}')
    local mem_usage=$(echo "scale=1; $mem_used * 100 / $mem_total" | bc 2>/dev/null || echo "0")
    local mem_gb=$(echo "scale=1; $mem_used / 1024 / 1024" | bc 2>/dev/null || echo "0")
    
    # 磁盘
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
    local disk_used=$(df -h / | tail -1 | awk '{print $3}')
    local disk_total=$(df -h / | tail -1 | awk '{print $2}')
    
    # 负载
    local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
    
    echo "${cpu_usage}|${mem_usage}|${mem_gb}|${disk_usage}|${disk_used}|${disk_total}|${load}"
}

# 获取服务状态
get_service_status() {
    local service="$1"
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo -e "${GREEN}✓ 运行中${NC}"
    else
        echo -e "${RED}✗ 已停止${NC}"
    fi
}

# 获取API状态
get_api_status() {
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:3000/health" 2>/dev/null || echo "000")
    local response_time=$(curl -s -o /dev/null -w "%{time_total}" --max-time 3 "http://localhost:3000/health" 2>/dev/null || echo "0")
    
    if [ "$http_code" == "200" ]; then
        echo -e "${GREEN}✓ 正常${NC}|${response_time}s"
    else
        echo -e "${RED}✗ 异常${NC}|${http_code}"
    fi
}

# 获取数据库状态
get_db_status() {
    if sudo -u postgres pg_isready > /dev/null 2>&1; then
        local conn_count=$(sudo -u postgres psql -d ptool -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'ptool';" 2>/dev/null | xargs || echo "0")
        echo -e "${GREEN}✓ 正常${NC}|连接: $conn_count"
    else
        echo -e "${RED}✗ 异常${NC}"
    fi
}

# 获取Redis状态
get_redis_status() {
    if command -v redis-cli &> /dev/null; then
        local ping=$(redis-cli ping 2>/dev/null || echo "FAILED")
        if [ "$ping" == "PONG" ]; then
            echo -e "${GREEN}✓ 正常${NC}"
        else
            echo -e "${RED}✗ 异常${NC}"
        fi
    else
        echo -e "${YELLOW}- 未安装${NC}"
    fi
}

# 获取最近日志
get_recent_logs() {
    local count="${1:-5}"
    tail -$count /var/log/ptool/monitoring/alerts.log 2>/dev/null || echo "暂无告警日志"
}

# 获取备份状态
get_backup_status() {
    local backup_dir="/backup/ptool/encrypted"
    if [ -d "$backup_dir" ]; then
        local latest=$(ls -1t "$backup_dir"/*.enc 2>/dev/null | head -1)
        if [ -n "$latest" ]; then
            local backup_time=$(stat -c %y "$latest" 2>/dev/null | cut -d'.' -f1)
            local backup_size=$(du -h "$latest" 2>/dev/null | cut -f1)
            echo -e "${GREEN}✓ 正常${NC}|最近: $(basename $latest)"
            echo "    时间: $backup_time"
            echo "    大小: $backup_size"
        else
            echo -e "${YELLOW}⚠ 无备份${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ 未配置${NC}"
    fi
}

# 渲染仪表盘
render_dashboard() {
    clear_screen
    
    # 标题
    draw_header "🚀 PTool 运维 Dashboard"
    
    # 获取系统数据
    local sys_data=$(get_system_info)
    IFS='|' read -r cpu_usage mem_usage mem_gb disk_usage disk_used disk_total load <<< "$sys_data"
    
    # 系统资源面板
    echo -e "${BOLD}${CYAN}📊 系统资源${NC}"
    draw_line "-"
    
    # CPU
    local cpu_status="normal"
    if (( $(echo "$cpu_usage > 80" | bc -l 2>/dev/null || echo 0) )); then cpu_status="error"
    elif (( $(echo "$cpu_usage > 60" | bc -l 2>/dev/null || echo 0) )); then cpu_status="warn"
    fi
    printf "  CPU 使用率: "
    draw_progress_bar "${cpu_usage%.*}" 100 "$cpu_status"
    printf " %s%%\n" "$cpu_usage"
    
    # 内存
    local mem_status="normal"
    if (( $(echo "$mem_usage > 85" | bc -l 2>/dev/null || echo 0) )); then mem_status="error"
    elif (( $(echo "$mem_usage > 70" | bc -l 2>/dev/null || echo 0) )); then mem_status="warn"
    fi
    printf "  内存使用:   "
    draw_progress_bar "${mem_usage%.*}" 100 "$mem_status"
    printf " %s%% (%sGB)\n" "$mem_usage" "$mem_gb"
    
    # 磁盘
    local disk_status="normal"
    if [ "$disk_usage" -gt 90 ]; then disk_status="error"
    elif [ "$disk_usage" -gt 80 ]; then disk_status="warn"
    fi
    printf "  磁盘使用:   "
    draw_progress_bar "$disk_usage" 100 "$disk_status"
    printf " %s%% (%s/%s)\n" "$disk_usage" "$disk_used" "$disk_total"
    
    # 负载
    printf "  系统负载:   ${load}\n"
    echo ""
    
    # 服务状态面板
    echo -e "${BOLD}${CYAN}🔧 服务状态${NC}"
    draw_line "-"
    
    printf "  Nginx      %s\n" "$(get_service_status nginx)"
    printf "  PostgreSQL %s\n" "$(get_service_status postgresql)"
    printf "  Redis      %s\n" "$(get_redis_status)"
    printf "  API服务    %s\n" "$(get_api_status)"
    printf "  数据库     %s\n" "$(get_db_status)"
    echo ""
    
    # 备份状态
    echo -e "${BOLD}${CYAN}💾 备份状态${NC}"
    draw_line "-"
    get_backup_status
    echo ""
    
    # 最近告警
    echo -e "${BOLD}${CYAN}⚠️  最近告警${NC}"
    draw_line "-"
    get_recent_logs 3
    echo ""
    
    # 底部信息
    draw_line "="
    echo -e "${WHITE}最后更新: $(date '+%Y-%m-%d %H:%M:%S') | 按 Ctrl+C 退出 | 输入 'help' 查看命令${NC}"
}

# 绘制进度条
draw_progress_bar() {
    local value="$1"
    local max="$2"
    local status="${3:-normal}"
    local width=30
    
    local filled=$((value * width / max))
    local empty=$((width - filled))
    
    local color="$GREEN"
    case "$status" in
        warn) color="$YELLOW" ;;
        error) color="$RED" ;;
    esac
    
    printf "${color}["
    printf "%${filled}s" "" | tr " " "█"
    printf "%${empty}s" "" | tr " " "░"
    printf "]${NC}"
}

# 交互模式
interactive_mode() {
    while true; do
        render_dashboard
        
        # 读取用户输入 (带超时)
        read -t 5 -p "" cmd || true
        
        case "$cmd" in
            q|quit|exit)
                echo -e "\n退出Dashboard"
                exit 0
                ;;
            h|help)
                clear_screen
                echo "=== 命令帮助 ==="
                echo "  h/help   - 显示帮助"
                echo "  r/refresh - 立即刷新"
                echo "  logs     - 查看日志"
                echo "  status   - 详细状态"
                echo "  restart  - 重启服务"
                echo "  backup   - 执行备份"
                echo "  q/quit   - 退出"
                echo ""
                read -p "按回车继续..."
                ;;
            r|refresh)
                continue
                ;;
            logs)
                clear_screen
                tail -50 /var/log/ptool/monitoring/health.log
                echo ""
                read -p "按回车继续..."
                ;;
            status)
                clear_screen
                /opt/ptool/server-version/scripts/monitoring/health-monitor.sh report | cat
                echo ""
                read -p "按回车继续..."
                ;;
            restart)
                clear_screen
                echo "重启服务..."
                pm2 restart all 2>/dev/null || systemctl restart ptool
                sleep 3
                ;;
            backup)
                clear_screen
                echo "执行备份..."
                /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh full
                echo ""
                read -p "按回车继续..."
                ;;
            *)
                # 继续刷新
                ;;
        esac
    done
}

# 一次性报告模式
report_mode() {
    render_dashboard
}

# 主函数
main() {
    case "${1:-dashboard}" in
        dashboard|d)
            interactive_mode
            ;;
        report|r)
            report_mode
            ;;
        json|j)
            # JSON输出模式
            local sys_data=$(get_system_info)
            IFS='|' read -r cpu_usage mem_usage mem_gb disk_usage disk_used disk_total load <<< "$sys_data"
            
            cat << EOF
{
    "timestamp": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "system": {
        "cpu_usage": $cpu_usage,
        "memory_usage": $mem_usage,
        "memory_used_gb": $mem_gb,
        "disk_usage": $disk_usage,
        "load_average": "$load"
    },
    "services": {
        "nginx": "$(systemctl is-active nginx 2>/dev/null || echo 'unknown')",
        "postgresql": "$(systemctl is-active postgresql 2>/dev/null || echo 'unknown')",
        "api": "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo '000')"
    }
}
EOF
            ;;
        *)
            echo "用法: $0 [dashboard|report|json]"
            echo ""
            echo "模式说明:"
            echo "  dashboard (d) - 交互式仪表盘 (默认)"
            echo "  report (r)    - 一次性报告"
            echo "  json (j)      - JSON格式输出"
            exit 1
            ;;
    esac
}

main "$@"
LEGACY_SCRIPT
