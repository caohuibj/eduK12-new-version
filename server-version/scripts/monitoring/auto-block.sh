#!/bin/bash
# =============================================================================
# PTool 自动IP封禁系统
# 功能: 检测暴力破解并自动封禁IP
# 触发: 每5分钟运行 (crontab)
# =============================================================================

set -e

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/monitor-config.env"
LOG_DIR="/var/log/ptool/security"
BLOCK_LOG="${LOG_DIR}/blocked-ips.log"

# 加载配置
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# 默认配置
AUTO_BLOCK_IP=${AUTO_BLOCK_IP:-false}
MAX_FAILED_LOGIN=${MAX_FAILED_LOGIN:-5}
LOGIN_WINDOW=${LOGIN_WINDOW:-300}
BLOCK_DURATION=${BLOCK_DURATION:-86400}

# 初始化
init() {
    mkdir -p "$LOG_DIR"
    touch "$BLOCK_LOG"
}

# 日志
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BLOCK_LOG"
}

# 检查IP是否已封禁
is_blocked() {
    local ip="$1"
    iptables -L INPUT -n | grep -q "$ip"
}

# 封禁IP
block_ip() {
    local ip="$1"
    local reason="${2:-暴力破解攻击}"
    
    if is_blocked "$ip"; then
        log "IP $ip 已在封禁列表中"
        return 0
    fi
    
    # 添加iptables规则
    iptables -I INPUT 1 -s "$ip" -j DROP
    
    log "🚫 已封禁IP: $ip (原因: $reason)"
    
    # 发送告警
    if [ -n "$SECURITY_WEBHOOK" ]; then
        curl -s -X POST "$SECURITY_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"type\":\"security\",\"level\":\"CRITICAL\",\"message\":\"IP $ip 因$reason被自动封禁\",\"timestamp\":\"$(date -Iseconds)\"}" \
            > /dev/null 2>&1 || true
    fi
    
    # 记录到系统日志
    logger -t ptool-security "封禁IP: $ip ($reason)"
    
    # 保存规则
    save_iptables
}

# 解封IP
unblock_ip() {
    local ip="$1"
    
    if ! is_blocked "$ip"; then
        return 0
    fi
    
    iptables -D INPUT -s "$ip" -j DROP 2>/dev/null || true
    log "✅ 已解封IP: $ip"
    
    save_iptables
}

# 保存iptables规则
save_iptables() {
    if command -v iptables-save &> /dev/null; then
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4
    fi
}

# 检查SSH暴力破解
check_ssh_bruteforce() {
    log "检查SSH暴力破解..."
    
    # 获取最近5分钟的失败登录记录
    local failed_attempts
    failed_attempts=$(grep "Failed password" /var/log/auth.log 2>/dev/null | tail -100 || echo "")
    
    if [ -z "$failed_attempts" ]; then
        return 0
    fi
    
    # 统计IP的失败次数
    local suspicious_ips
    suspicious_ips=$(echo "$failed_attempts" | grep -oE 'from [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | sed 's/from //' | sort | uniq -c | sort -rn)
    
    while read -r count ip; do
        if [ -n "$ip" ] && [ "$count" -gt "$MAX_FAILED_LOGIN" ]; then
            if ! is_blocked "$ip"; then
                block_ip "$ip" "SSH暴力破解(${count}次失败登录)"
            fi
        fi
    done <<< "$suspicious_ips"
}

# 检查Web登录暴力破解
check_web_bruteforce() {
    log "检查Web登录暴力破解..."
    
    # 检查Nginx日志中的登录失败
    if [ -f "/var/log/nginx/access.log" ]; then
        # 查找登录接口的频繁请求
        local suspicious_ips
        suspicious_ips=$(grep "/api/auth/login" /var/log/nginx/access.log 2>/dev/null | \
            awk '{print $1}' | sort | uniq -c | sort -rn | head -10)
        
        while read -r count ip; do
            if [ -n "$ip" ] && [ "$count" -gt 20 ]; then
                if ! is_blocked "$ip"; then
                    block_ip "$ip" "Web登录暴力破解(${count}次请求)"
                fi
            fi
        done <<< "$suspicious_ips"
    fi
}

# 检查Web攻击尝试
check_web_attacks() {
    log "检查Web攻击..."
    
    if [ ! -f "/var/log/nginx/access.log" ]; then
        return 0
    fi
    
    # SQL注入尝试
    local sql_ips
    sql_ips=$(grep -iE "(union|select|insert|update|delete|drop).*--" /var/log/nginx/access.log 2>/dev/null | \
        awk '{print $1}' | sort | uniq -c | sort -rn | head -5)
    
    while read -r count ip; do
        if [ -n "$ip" ] && [ "$count" -gt 5 ]; then
            if ! is_blocked "$ip"; then
                block_ip "$ip" "SQL注入攻击尝试"
            fi
        fi
    done <<< "$sql_ips"
    
    # XSS尝试
    local xss_ips
    xss_ips=$(grep -iE "(<script|javascript:|onerror=|onload=)" /var/log/nginx/access.log 2>/dev/null | \
        awk '{print $1}' | sort | uniq -c | sort -rn | head -5)
    
    while read -r count ip; do
        if [ -n "$ip" ] && [ "$count" -gt 5 ]; then
            if ! is_blocked "$ip"; then
                block_ip "$ip" "XSS攻击尝试"
            fi
        fi
    done <<< "$xss_ips"
    
    # 目录遍历尝试
    local traversal_ips
    traversal_ips=$(grep -E "\.\./|\.\.\\\\" /var/log/nginx/access.log 2>/dev/null | \
        awk '{print $1}' | sort | uniq -c | sort -rn | head -5)
    
    while read -r count ip; do
        if [ -n "$ip" ] && [ "$count" -gt 5 ]; then
            if ! is_blocked "$ip"; then
                block_ip "$ip" "目录遍历攻击尝试"
            fi
        fi
    done <<< "$traversal_ips"
}

# 清理过期封禁
cleanup_expired_blocks() {
    log "检查过期封禁..."
    
    # 读取封禁记录，解封超过24小时的IP
    local now=$(date +%s)
    local cutoff=$((now - BLOCK_DURATION))
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^\[([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
            local block_date="${BASH_REMATCH[1]}"
            local block_timestamp=$(date -d "$block_date" +%s 2>/dev/null || echo "0")
            
            if [ "$block_timestamp" -lt "$cutoff" ]; then
                # 提取IP
                local ip=$(echo "$line" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
                if [ -n "$ip" ]; then
                    unblock_ip "$ip"
                fi
            fi
        fi
    done < "$BLOCK_LOG"
}

# 列出封禁的IP
list_blocked() {
    echo "=== 当前封禁的IP ==="
    iptables -L INPUT -n | grep DROP | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | while read ip; do
        local count=$(grep -c "$ip" "$BLOCK_LOG")
        echo "  $ip (封禁次数: $count)"
    done
    echo ""
    echo "=== 封禁历史 ==="
    tail -20 "$BLOCK_LOG"
}

# 主函数
main() {
    if [ "$AUTO_BLOCK_IP" != "true" ]; then
        echo "自动封禁未启用，在 monitor-config.env 中设置 AUTO_BLOCK_IP=true 以启用"
        exit 0
    fi
    
    init
    log "========== 自动封禁检查开始 =========="
    
    check_ssh_bruteforce
    check_web_bruteforce
    check_web_attacks
    cleanup_expired_blocks
    
    log "========== 自动封禁检查完成 =========="
}

# 根据参数执行
case "${1:-run}" in
    run)
        main
        ;;
    block)
        block_ip "$2" "手动封禁"
        ;;
    unblock)
        unblock_ip "$2"
        ;;
    list)
        list_blocked
        ;;
    status)
        echo "自动封禁状态: $AUTO_BLOCK_IP"
        echo "失败登录阈值: $MAX_FAILED_LOGIN 次"
        echo "检测窗口: $LOGIN_WINDOW 秒"
        echo "封禁时长: $((BLOCK_DURATION / 3600)) 小时"
        echo ""
        list_blocked
        ;;
    *)
        echo "用法: $0 [run|block <ip>|unblock <ip>|list|status]"
        echo ""
        echo "说明:"
        echo "  run           - 执行自动封禁检查"
        echo "  block <ip>    - 手动封禁IP"
        echo "  unblock <ip>  - 手动解封IP"
        echo "  list          - 列出封禁的IP"
        echo "  status        - 显示状态和统计"
        exit 1
        ;;
esac
