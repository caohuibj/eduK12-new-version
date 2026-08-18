#!/bin/bash
# =============================================================================
# PTool 统一告警发送脚本
# 支持: 企业微信、钉钉、Slack、邮件
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/monitor-config.env"

# 加载配置
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# 默认配置
ALERT_LEVEL="${1:-INFO}"
ALERT_TITLE="${2:-系统告警}"
ALERT_MESSAGE="${3:-}"
ALERT_TYPE="${4:-general}"

# 颜色配置
RED='🔴'
YELLOW='🟡'
GREEN='🟢'
BLUE='🔵'

# 获取级别图标
get_level_icon() {
    case "$ALERT_LEVEL" in
        CRITICAL|严重)
            echo "$RED"
            ;;
        WARNING|警告)
            echo "$YELLOW"
            ;;
        INFO|信息)
            echo "$GREEN"
            ;;
        *)
            echo "$BLUE"
            ;;
    esac
}

# 发送企业微信告警
send_wechat() {
    local webhook="$1"
    local icon=$(get_level_icon)
    
    local json_payload=$(cat <<EOF
{
    "msgtype": "markdown",
    "markdown": {
        "content": "## ${icon} ${ALERT_TITLE}\n\n**级别:** ${ALERT_LEVEL}\n**时间:** $(date '+%Y-%m-%d %H:%M:%S')\n**主机:** $(hostname)\n**类型:** ${ALERT_TYPE}\n\n---\n\n${ALERT_MESSAGE}"
    }
}
EOF
)
    
    curl -s -X POST "$webhook" \
        -H "Content-Type: application/json" \
        -d "$json_payload" > /dev/null 2>&1
}

# 发送钉钉告警
send_dingtalk() {
    local webhook="$1"
    local icon=$(get_level_icon)
    
    local json_payload=$(cat <<EOF
{
    "msgtype": "markdown",
    "markdown": {
        "title": "${ALERT_TITLE}",
        "text": "## ${icon} ${ALERT_TITLE}\n\n**级别:** ${ALERT_LEVEL}\n**时间:** $(date '+%Y-%m-%d %H:%M:%S')\n**主机:** $(hostname)\n**类型:** ${ALERT_TYPE}\n\n---\n\n${ALERT_MESSAGE}"
    }
}
EOF
)
    
    curl -s -X POST "$webhook" \
        -H "Content-Type: application/json" \
        -d "$json_payload" > /dev/null 2>&1
}

# 发送Slack告警
send_slack() {
    local webhook="$1"
    local icon=$(get_level_icon)
    local color="good"
    
    case "$ALERT_LEVEL" in
        CRITICAL|严重)
            color="danger"
            ;;
        WARNING|警告)
            color="warning"
            ;;
    esac
    
    local json_payload=$(cat <<EOF
{
    "attachments": [
        {
            "color": "${color}",
            "title": "${icon} ${ALERT_TITLE}",
            "fields": [
                {"title": "级别", "value": "${ALERT_LEVEL}", "short": true},
                {"title": "时间", "value": "$(date '+%Y-%m-%d %H:%M:%S')", "short": true},
                {"title": "主机", "value": "$(hostname)", "short": true},
                {"title": "类型", "value": "${ALERT_TYPE}", "short": true},
                {"title": "详情", "value": "${ALERT_MESSAGE}", "short": false}
            ]
        }
    ]
}
EOF
)
    
    curl -s -X POST "$webhook" \
        -H "Content-Type: application/json" \
        -d "$json_payload" > /dev/null 2>&1
}

# 发送邮件告警
send_email() {
    local email="$1"
    
    if command -v mail &> /dev/null; then
        echo -e "级别: ${ALERT_LEVEL}\n时间: $(date '+%Y-%m-%d %H:%M:%S')\n主机: $(hostname)\n类型: ${ALERT_TYPE}\n\n${ALERT_MESSAGE}" | \
            mail -s "[PTool告警] ${ALERT_TITLE}" "$email" 2>/dev/null || true
    fi
}

# 主发送函数
send_alert() {
    local type="$1"
    
    case "$type" in
        wechat|weixin)
            if [ -n "$WECHAT_WEBHOOK" ]; then
                send_wechat "$WECHAT_WEBHOOK"
            fi
            ;;
        dingtalk|钉钉)
            if [ -n "$DINGTALK_WEBHOOK" ]; then
                send_dingtalk "$DINGTALK_WEBHOOK"
            fi
            ;;
        slack)
            if [ -n "$ALERT_WEBHOOK" ]; then
                send_slack "$ALERT_WEBHOOK"
            fi
            ;;
        email|邮件)
            if [ -n "$ALERT_EMAIL" ]; then
                send_email "$ALERT_EMAIL"
            fi
            ;;
        all|全部)
            # 发送到所有配置的渠道
            [ -n "$WECHAT_WEBHOOK" ] && send_wechat "$WECHAT_WEBHOOK"
            [ -n "$DINGTALK_WEBHOOK" ] && send_dingtalk "$DINGTALK_WEBHOOK"
            [ -n "$ALERT_WEBHOOK" ] && send_slack "$ALERT_WEBHOOK"
            [ -n "$ALERT_EMAIL" ] && send_email "$ALERT_EMAIL"
            ;;
        *)
            # 默认发送到通用webhook
            if [ -n "$ALERT_WEBHOOK" ]; then
                send_slack "$ALERT_WEBHOOK"
            fi
            ;;
    esac
}

# 测试告警
send_test_alert() {
    ALERT_LEVEL="INFO"
    ALERT_TITLE="告警测试"
    ALERT_MESSAGE="这是一条测试消息，用于验证告警配置是否正确。"
    ALERT_TYPE="test"
    
    echo "发送测试告警到所有配置渠道..."
    
    if [ -n "$WECHAT_WEBHOOK" ]; then
        echo "  - 发送到企业微信..."
        send_wechat "$WECHAT_WEBHOOK" && echo "    ✅ 成功" || echo "    ❌ 失败"
    fi
    
    if [ -n "$DINGTALK_WEBHOOK" ]; then
        echo "  - 发送到钉钉..."
        send_dingtalk "$DINGTALK_WEBHOOK" && echo "    ✅ 成功" || echo "    ❌ 失败"
    fi
    
    if [ -n "$ALERT_WEBHOOK" ]; then
        echo "  - 发送到Slack..."
        send_slack "$ALERT_WEBHOOK" && echo "    ✅ 成功" || echo "    ❌ 失败"
    fi
    
    if [ -n "$ALERT_EMAIL" ]; then
        echo "  - 发送到邮件..."
        send_email "$ALERT_EMAIL" && echo "    ✅ 成功" || echo "    ❌ 失败"
    fi
    
    echo ""
    echo "如果以上都显示失败，请检查:"
    echo "  1. 网络连接是否正常"
    echo "  2. Webhook地址是否正确"
    echo "  3. 机器人是否被禁用"
}

# 根据参数执行
case "${1:-help}" in
    test)
        send_test_alert
        ;;
    wechat|weixin)
        shift
        ALERT_LEVEL="${1:-INFO}"
        ALERT_TITLE="${2:-告警}"
        ALERT_MESSAGE="${3:-}"
        send_wechat "$WECHAT_WEBHOOK"
        ;;
    dingtalk)
        shift
        ALERT_LEVEL="${1:-INFO}"
        ALERT_TITLE="${2:-告警}"
        ALERT_MESSAGE="${3:-}"
        send_dingtalk "$DINGTALK_WEBHOOK"
        ;;
    slack)
        shift
        ALERT_LEVEL="${1:-INFO}"
        ALERT_TITLE="${2:-告警}"
        ALERT_MESSAGE="${3:-}"
        send_slack "$ALERT_WEBHOOK"
        ;;
    email)
        shift
        ALERT_LEVEL="${1:-INFO}"
        ALERT_TITLE="${2:-告警}"
        ALERT_MESSAGE="${3:-}"
        send_email "$ALERT_EMAIL"
        ;;
    send)
        shift
        ALERT_LEVEL="${1:-INFO}"
        ALERT_TITLE="${2:-告警}"
        ALERT_MESSAGE="${3:-}"
        ALERT_TYPE="${4:-general}"
        send_alert "all"
        ;;
    help|*)
        echo "用法: $0 [test|wechat|dingtalk|slack|email|send] [参数...]"
        echo ""
        echo "命令:"
        echo "  test                    - 发送测试告警到所有配置渠道"
        echo "  wechat <级别> <标题> <内容>   - 发送到企业微信"
        echo "  dingtalk <级别> <标题> <内容> - 发送到钉钉"
        echo "  slack <级别> <标题> <内容>    - 发送到Slack"
        echo "  email <级别> <标题> <内容>    - 发送邮件"
        echo "  send <级别> <标题> <内容>     - 发送到所有配置渠道"
        echo ""
        echo "示例:"
        echo "  $0 test"
        echo "  $0 send CRITICAL '服务器告警' 'CPU使用率超过90%'"
        echo ""
        echo "当前配置:"
        [ -n "$WECHAT_WEBHOOK" ] && echo "  企业微信: 已配置" || echo "  企业微信: 未配置"
        [ -n "$DINGTALK_WEBHOOK" ] && echo "  钉钉: 已配置" || echo "  钉钉: 未配置"
        [ -n "$ALERT_WEBHOOK" ] && echo "  Slack: 已配置" || echo "  Slack: 未配置"
        [ -n "$ALERT_EMAIL" ] && echo "  邮件: 已配置" || echo "  邮件: 未配置"
        ;;
esac
