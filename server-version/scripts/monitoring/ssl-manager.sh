#!/bin/bash
# =============================================================================
# PTool SSL证书管理脚本
# 功能: 自动申请/续期/部署SSL证书 (Let's Encrypt)
# 频率: 每周运行一次 (certbot会自动检查是否需要续期)
# =============================================================================

set -e

cat >&2 <<'NOTICE'
此宿主机 Certbot/Nginx 证书入口已停用。
请在受控的边缘代理或云负载均衡中管理 TLS；本脚本不会安装软件、写入 systemd 或重载宿主机 Nginx。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/ptool/monitoring/ssl-manager.log"
CERT_DIR="/etc/letsencrypt/live"
DOMAIN="${DOMAIN:-}"  # 需要设置环境变量或在配置文件中定义
EMAIL="${ADMIN_EMAIL:-admin@example.com}"
NGINX_CONF="/etc/nginx/sites-available/ptool"

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
    logger -t ptool-ssl "$message"
    
    if [ -n "$SSL_WEBHOOK" ]; then
        curl -s -X POST "$SSL_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"event\":\"ssl\",\"message\":\"$message\",\"domain\":\"$DOMAIN\"}" \
            > /dev/null 2>&1 || true
    fi
}

# 安装Certbot
install_certbot() {
    if ! command -v certbot &> /dev/null; then
        log "安装 Certbot..."
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
        log "Certbot 安装完成"
    fi
}

# 申请新证书
obtain_certificate() {
    if [ -z "$DOMAIN" ]; then
        log "错误: 未设置 DOMAIN 环境变量"
        exit 1
    fi
    
    log "为 $DOMAIN 申请SSL证书..."
    
    # 使用nginx插件申请
    certbot --nginx \
        -d "$DOMAIN" \
        --agree-tos \
        --non-interactive \
        --email "$EMAIL" \
        --redirect \
        --hsts \
        --staple-ocsp
    
    if [ $? -eq 0 ]; then
        log "证书申请成功"
        notify "SSL证书申请成功: $DOMAIN"
        
        # 重启Nginx
        systemctl reload nginx
        
        return 0
    else
        log "证书申请失败"
        notify "SSL证书申请失败: $DOMAIN"
        return 1
    fi
}

# 续期证书
renew_certificates() {
    log "检查并续期SSL证书..."
    
    # 使用nginx插件续期
    certbot renew --nginx --quiet --deploy-hook "systemctl reload nginx"
    
    local renew_result=$?
    
    if [ $renew_result -eq 0 ]; then
        log "证书续期检查完成"
    else
        log "证书续期检查失败"
        notify "SSL证书续期检查失败"
    fi
    
    return $renew_result
}

# 检查证书过期时间
check_expiry() {
    if [ -z "$DOMAIN" ]; then
        echo "未设置域名"
        return 1
    fi
    
    local cert_path="$CERT_DIR/$DOMAIN/fullchain.pem"
    
    if [ ! -f "$cert_path" ]; then
        echo "证书文件不存在: $cert_path"
        return 1
    fi
    
    local expiry_date
    expiry_date=$(openssl x509 -enddate -noout -in "$cert_path" | cut -d= -f2)
    local expiry_timestamp=$(date -d "$expiry_date" +%s)
    local current_timestamp=$(date +%s)
    local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
    
    echo "$days_until_expiry"
}

# 显示证书信息
show_certificate_info() {
    if [ -z "$DOMAIN" ]; then
        echo "请设置 DOMAIN 环境变量"
        return 1
    fi
    
    local cert_path="$CERT_DIR/$DOMAIN/fullchain.pem"
    
    if [ ! -f "$cert_path" ]; then
        echo "证书不存在，需要先申请"
        return 1
    fi
    
    echo "=== SSL证书信息 ==="
    echo "域名: $DOMAIN"
    echo "证书路径: $cert_path"
    echo ""
    
    echo "主题:"
    openssl x509 -in "$cert_path" -noout -subject
    
    echo ""
    echo "颁发者:"
    openssl x509 -in "$cert_path" -noout -issuer
    
    echo ""
    echo "有效期:"
    openssl x509 -in "$cert_path" -noout -dates
    
    echo ""
    echo "剩余天数: $(check_expiry) 天"
    
    echo ""
    echo "SAN (主题备用名称):"
    openssl x509 -in "$cert_path" -noout -text | grep -A1 "Subject Alternative Name"
}

# 强制续期
force_renew() {
    log "强制续期证书..."
    certbot renew --force-renew --nginx
    systemctl reload nginx
    log "强制续期完成"
}

# 吊销证书
revoke_certificate() {
    if [ -z "$DOMAIN" ]; then
        echo "请设置 DOMAIN 环境变量"
        return 1
    fi
    
    log "吊销证书: $DOMAIN"
    certbot revoke --cert-name "$DOMAIN"
    certbot delete --cert-name "$DOMAIN"
    log "证书已吊销并删除"
}

# 测试自动续期
test_renewal() {
    log "测试自动续期..."
    certbot renew --dry-run
    log "测试完成"
}

# 主函数
main() {
    init
    
    # 确保Certbot已安装
    install_certbot
    
    case "${1:-renew}" in
        obtain)
            obtain_certificate
            ;;
        renew)
            renew_certificates
            ;;
        check)
            local days
            days=$(check_expiry)
            echo "证书将在 $days 天后过期"
            
            if [ "$days" -lt 7 ]; then
                log "警告: 证书即将过期 ($days 天)"
                notify "SSL证书即将过期: $DOMAIN (剩余 $days 天)"
            fi
            ;;
        info)
            show_certificate_info
            ;;
        force)
            force_renew
            ;;
        revoke)
            revoke_certificate
            ;;
        test)
            test_renewal
            ;;
        setup-cron)
            # 设置自动续期定时任务 (每周一凌晨3点)
            (crontab -l 2>/dev/null; echo "0 3 * * 1 /opt/ptool/server-version/scripts/monitoring/ssl-manager.sh renew >> /var/log/ptool/monitoring/ssl-renew.log 2>&1") | crontab -
            log "已设置自动续期定时任务"
            ;;
        *)
            echo "用法: $0 [obtain|renew|check|info|force|revoke|test|setup-cron]"
            echo ""
            echo "命令说明:"
            echo "  obtain     - 申请新证书"
            echo "  renew      - 续期证书"
            echo "  check      - 检查过期时间"
            echo "  info       - 显示证书详情"
            echo "  force      - 强制续期"
            echo "  revoke     - 吊销证书"
            echo "  test       - 测试续期流程"
            echo "  setup-cron - 设置自动续期定时任务"
            echo ""
            echo "环境变量:"
            echo "  DOMAIN      - 域名 (必需)"
            echo "  ADMIN_EMAIL - 管理员邮箱"
            exit 1
            ;;
    esac
}

main "$@"
LEGACY_SCRIPT
