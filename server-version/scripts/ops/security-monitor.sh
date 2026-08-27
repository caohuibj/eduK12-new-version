#!/bin/bash
# =============================================================================
# PTool 安全监控系统
# 功能: 异常登录检测、文件完整性检查、系统安全扫描
# 频率: 建议每5分钟运行一次 (crontab)
# =============================================================================

set -e

echo '此宿主机安全监控脚本已停用；请使用本地 Compose 监控服务或经审批的外部运维方案。' >&2
exit 1

: <<'LEGACY_SCRIPT'

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../monitoring/monitor-config.env"
LOG_DIR="/var/log/ptool/security"
SECURITY_LOG="${LOG_DIR}/security.log"
ALERT_LOG="${LOG_DIR}/alerts.log"
BASELINE_DIR="${LOG_DIR}/baseline"

# 加载配置
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# 安全阈值
MAX_FAILED_LOGIN=${MAX_FAILED_LOGIN:-5}         # 最大失败登录次数
LOGIN_WINDOW=${LOGIN_WINDOW:-300}               # 检测窗口(秒)
FILE_CHECK_INTERVAL=${FILE_CHECK_INTERVAL:-3600} # 文件检查间隔(秒)
SUSPICIOUS_IP_THRESHOLD=${SUSPICIOUS_IP_THRESHOLD:-10} # 可疑IP阈值

# 颜色输出
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# 初始化
init() {
    mkdir -p "$LOG_DIR" "$BASELINE_DIR"
    touch "$SECURITY_LOG" "$ALERT_LOG"
}

# 日志函数
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1" | tee -a "$SECURITY_LOG"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $1${NC}" | tee -a "$ALERT_LOG"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1${NC}" | tee -a "$ALERT_LOG"
}

# 发送安全告警
send_security_alert() {
    local level="$1"
    local message="$2"
    
    log_error "[$level] $message"
    
    # 使用统一告警脚本
    local alert_script="${SCRIPT_DIR}/../monitoring/send-alert.sh"
    if [ -x "$alert_script" ]; then
        "$alert_script" send "$level" "🛡️ 安全告警" "$message" "security" 2>/dev/null || true
    fi
    
    # 系统日志
    logger -t ptool-security "[$level] $message"
}

# 检查异常登录
 check_failed_logins() {
    log_info "检查异常登录..."
    
    # 获取最近5分钟的失败登录记录
    local failed_attempts
    failed_attempts=$(grep "Failed password" /var/log/auth.log 2>/dev/null | tail -100 || echo "")
    
    if [ -z "$failed_attempts" ]; then
        return 0
    fi
    
    # 统计IP的失败次数
    local suspicious_ips
    suspicious_ips=$(echo "$failed_attempts" | grep -oE 'from [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | sed 's/from //' | sort | uniq -c | sort -rn | head -10)
    
    while read -r count ip; do
        if [ "$count" -gt "$MAX_FAILED_LOGIN" ]; then
            send_security_alert "WARNING" "检测到暴力破解攻击: IP $ip 在5分钟内失败登录 $count 次"
            
            # 可选：自动封禁IP
            if [ "${AUTO_BLOCK_IP:-false}" == "true" ]; then
                iptables -A INPUT -s "$ip" -j DROP 2>/dev/null || true
                log_warn "已自动封禁IP: $ip"
            fi
        fi
    done <<< "$suspicious_ips"
    
    # 检查成功登录的异常
    local recent_success
    recent_success=$(grep "Accepted password" /var/log/auth.log 2>/dev/null | tail -20 || echo "")
    if [ -n "$recent_success" ]; then
        # 检查是否有非工作时间的登录
        local current_hour=$(date +%H)
        if [ "$current_hour" -lt 6 ] || [ "$current_hour" -gt 23 ]; then
            local night_logins=$(echo "$recent_success" | grep "$(date '+%b %e')" || echo "")
            if [ -n "$night_logins" ]; then
                send_security_alert "WARNING" "检测到非工作时间登录活动"
            fi
        fi
    fi
}

# 检查系统用户变更
check_user_changes() {
    log_info "检查系统用户变更..."
    
    local baseline_file="${BASELINE_DIR}/users.baseline"
    local current_users="${BASELINE_DIR}/users.current"
    
    # 获取当前用户列表
    cut -d: -f1 /etc/passwd | sort > "$current_users"
    
    if [ ! -f "$baseline_file" ]; then
        # 首次运行，创建基线
        cp "$current_users" "$baseline_file"
        log_info "已创建用户基线"
        return 0
    fi
    
    # 对比基线
    local new_users
    new_users=$(comm -13 "$baseline_file" "$current_users")
    
    if [ -n "$new_users" ]; then
        send_security_alert "CRITICAL" "检测到新增系统用户: $new_users"
    fi
    
    # 检查sudoers变更
    local sudoers_baseline="${BASELINE_DIR}/sudoers.baseline"
    local sudoers_current="${BASELINE_DIR}/sudoers.current"
    
    cat /etc/sudoers /etc/sudoers.d/* 2>/dev/null | grep -v '^#' | grep -v '^$' | sort > "$sudoers_current" || true
    
    if [ ! -f "$sudoers_baseline" ]; then
        cp "$sudoers_current" "$sudoers_baseline"
    else
        local sudoers_diff
        sudoers_diff=$(diff "$sudoers_baseline" "$sudoers_current" 2>/dev/null || echo "")
        if [ -n "$sudoers_diff" ]; then
            send_security_alert "CRITICAL" "检测到sudo权限变更"
        fi
    fi
}

# 检查关键文件完整性
check_file_integrity() {
    log_info "检查关键文件完整性..."
    
    local baseline_file="${BASELINE_DIR}/files.baseline"
    local current_checksums="${BASELINE_DIR}/files.current"
    
    # 定义关键文件列表
    local critical_files=(
        "/etc/passwd"
        "/etc/shadow"
        "/etc/hosts"
        "/etc/nginx/nginx.conf"
        "/etc/nginx/sites-available/ptool"
        "/opt/ptool/server-version/backend/.env"
        "/opt/ptool/server-version/docker-compose.yml"
    )
    
    # 计算当前校验和
    > "$current_checksums"
    for file in "${critical_files[@]}"; do
        if [ -f "$file" ]; then
            sha256sum "$file" >> "$current_checksums"
        fi
    done
    
    if [ ! -f "$baseline_file" ]; then
        cp "$current_checksums" "$baseline_file"
        log_info "已创建文件完整性基线"
        return 0
    fi
    
    # 对比校验和
    local changed_files
    changed_files=$(diff "$baseline_file" "$current_checksums" | grep "^>" | awk '{print $3}')
    
    if [ -n "$changed_files" ]; then
        send_security_alert "WARNING" "检测到关键文件变更: $changed_files"
    fi
}

# 检查可疑进程
check_suspicious_processes() {
    log_info "检查可疑进程..."
    
    # 检查CPU使用率异常的进程
    local high_cpu_procs
    high_cpu_procs=$(ps aux --sort=-%cpu | awk 'NR>1 && $3>50 {print $2,$3,$11}' | head -5)
    
    if [ -n "$high_cpu_procs" ]; then
        while read -r pid cpu cmd; do
            # 排除已知的高CPU进程（如视频处理）
            if [[ ! "$cmd" =~ (ffmpeg|node) ]]; then
                send_security_alert "WARNING" "检测到高CPU进程: PID=$pid CPU=$cmd"
            fi
        done <<< "$high_cpu_procs"
    fi
    
    # 检查网络连接异常
    local suspicious_connections
    suspicious_connections=$(netstat -ant 2>/dev/null | grep ESTABLISHED | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10 || echo "")
    
    if [ -n "$suspicious_connections" ]; then
        while read -r count ip; do
            if [ "$count" -gt "$SUSPICIOUS_IP_THRESHOLD" ]; then
                # 检查是否为已知IP
                if ! grep -q "$ip" /etc/hosts 2>/dev/null; then
                    send_security_alert "WARNING" "检测到异常连接: IP $ip 有 $count 个连接"
                fi
            fi
        done <<< "$suspicious_connections"
    fi
}

# 检查磁盘异常（如勒索软件加密）
check_disk_anomalies() {
    log_info "检查磁盘异常..."
    
    # 检查短时间内大量文件变更（可能是加密）
    local upload_dir="/opt/ptool/server-version/backend/uploads"
    if [ -d "$upload_dir" ]; then
        local recent_changes
        recent_changes=$(find "$upload_dir" -type f -mmin -10 2>/dev/null | wc -l)
        
        if [ "$recent_changes" -gt 100 ]; then
            send_security_alert "CRITICAL" "检测到异常文件活动: 10分钟内 $recent_changes 个文件被修改"
        fi
    fi
    
    # 检查可疑文件扩展名
    local suspicious_extensions
    suspicious_extensions=$(find /tmp /var/tmp -name "*.encrypted" -o -name "*.locked" -o -name "README*.txt" 2>/dev/null | head -10)
    
    if [ -n "$suspicious_extensions" ]; then
        send_security_alert "CRITICAL" "检测到可疑文件(可能是勒索软件): $suspicious_extensions"
    fi
}

# 检查SSH配置安全
check_ssh_security() {
    log_info "检查SSH安全配置..."
    
    local ssh_config="/etc/ssh/sshd_config"
    
    if [ -f "$ssh_config" ]; then
        # 检查是否允许root登录
        local root_login
        root_login=$(grep "^PermitRootLogin" "$ssh_config" | awk '{print $2}')
        if [ "$root_login" == "yes" ]; then
            send_security_alert "WARNING" "SSH允许root登录，存在安全隐患"
        fi
        
        # 检查是否使用密码认证
        local password_auth
        password_auth=$(grep "^PasswordAuthentication" "$ssh_config" | awk '{print $2}')
        if [ "$password_auth" == "yes" ]; then
            log_warn "SSH使用密码认证，建议使用密钥认证"
        fi
        
        # 检查端口
        local ssh_port
        ssh_port=$(grep "^Port" "$ssh_config" | awk '{print $2}')
        if [ -z "$ssh_port" ] || [ "$ssh_port" == "22" ]; then
            log_warn "SSH使用默认端口22，建议修改"
        fi
    fi
}

# 检查Web应用安全
check_web_security() {
    log_info "检查Web应用安全..."
    
    # 检查Nginx访问日志中的可疑请求
    local nginx_log="/var/log/nginx/access.log"
    if [ -f "$nginx_log" ]; then
        # 检查SQL注入尝试
        local sql_injection
        sql_injection=$(grep -iE "(union|select|insert|update|delete|drop).*--" "$nginx_log" 2>/dev/null | tail -5 || echo "")
        if [ -n "$sql_injection" ]; then
            send_security_alert "CRITICAL" "检测到SQL注入攻击尝试"
        fi
        
        # 检查XSS尝试
        local xss_attempts
        xss_attempts=$(grep -iE "(<script|javascript:|onerror=|onload=)" "$nginx_log" 2>/dev/null | tail -5 || echo "")
        if [ -n "$xss_attempts" ]; then
            send_security_alert "WARNING" "检测到XSS攻击尝试"
        fi
        
        # 检查目录遍历
        local dir_traversal
        dir_traversal=$(grep -E "\.\./|\.\.\\" "$nginx_log" 2>/dev/null | tail -5 || echo "")
        if [ -n "$dir_traversal" ]; then
            send_security_alert "WARNING" "检测到目录遍历攻击尝试"
        fi
    fi
}

# 生成安全报告
generate_security_report() {
    local report_file="${LOG_DIR}/security-report-$(date +%Y%m%d).json"
    
    # 统计今日告警
    local today_alerts
    today_alerts=$(grep "$(date '+%Y-%m-%d')" "$ALERT_LOG" | wc -l)
    
    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "summary": {
        "total_alerts_today": $today_alerts,
        "last_check": "$(date '+%Y-%m-%d %H:%M:%S')"
    },
    "checks": {
        "failed_logins": "checked",
        "user_changes": "checked",
        "file_integrity": "checked",
        "suspicious_processes": "checked",
        "disk_anomalies": "checked",
        "ssh_security": "checked",
        "web_security": "checked"
    }
}
EOF
    
    log_info "安全报告已生成: $report_file"
}

# 初始化基线
init_baseline() {
    log_info "初始化安全基线..."
    
    # 用户基线
    cut -d: -f1 /etc/passwd | sort > "${BASELINE_DIR}/users.baseline"
    
    # sudoers基线
    cat /etc/sudoers /etc/sudoers.d/* 2>/dev/null | grep -v '^#' | grep -v '^$' | sort > "${BASELINE_DIR}/sudoers.baseline" || true
    
    # 文件完整性基线
    local critical_files=(
        "/etc/passwd"
        "/etc/shadow"
        "/etc/hosts"
        "/etc/nginx/nginx.conf"
    )
    > "${BASELINE_DIR}/files.baseline"
    for file in "${critical_files[@]}"; do
        if [ -f "$file" ]; then
            sha256sum "$file" >> "${BASELINE_DIR}/files.baseline"
        fi
    done
    
    log_info "安全基线初始化完成"
}

# 清理旧日志
cleanup_logs() {
    find "$LOG_DIR" -name "*.log" -mtime +30 -delete
    find "$LOG_DIR" -name "security-report-*.json" -mtime +90 -delete
    log_info "已清理旧日志"
}

# 主函数
main() {
    init
    
    log_info "========== 安全监控开始 =========="
    
    # 执行所有安全检查
    check_failed_logins
    check_user_changes
    check_file_integrity
    check_suspicious_processes
    check_disk_anomalies
    check_ssh_security
    check_web_security
    
    # 生成报告
    generate_security_report
    
    # 清理旧日志
    cleanup_logs
    
    log_info "========== 安全监控完成 =========="
}

# 根据参数执行
case "${1:-run}" in
    run)
        main
        ;;
    init)
        init_baseline
        ;;
    check-login)
        check_failed_logins
        ;;
    check-files)
        check_file_integrity
        ;;
    report)
        generate_security_report
        cat "${LOG_DIR}/security-report-$(date +%Y%m%d).json"
        ;;
    *)
        echo "用法: $0 [run|init|check-login|check-files|report]"
        exit 1
        ;;
esac
LEGACY_SCRIPT
