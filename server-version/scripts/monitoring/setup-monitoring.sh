#!/bin/bash
# =============================================================================
# PTool 运维自动化系统 - 一键安装脚本
# 功能: 安装并配置所有运维自动化组件
# =============================================================================

set -e

echo '此宿主机监控安装脚本已停用；请使用 pinned Docker Compose monitoring 服务。' >&2
exit 1

: <<'LEGACY_SCRIPT'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/ptool/monitoring"
MONITORING_DIR="$SCRIPT_DIR"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# 检查root权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error "请使用 sudo 运行此脚本"
        exit 1
    fi
}

# 创建必要的目录
setup_directories() {
    step "创建目录结构..."
    mkdir -p "$LOG_DIR"
    mkdir -p /backup/ptool
    chmod 755 /backup/ptool
    log "目录创建完成"
}

# 设置脚本权限
set_permissions() {
    step "设置脚本权限..."
    chmod +x "$MONITORING_DIR"/*.sh
    log "权限设置完成"
}

# 安装依赖工具
install_dependencies() {
    step "检查依赖工具..."
    
    # 检查必要工具
    local missing=()
    for cmd in bc jq curl wget openssl; do
        if ! command -v $cmd &> /dev/null; then
            missing+=($cmd)
        fi
    done
    
    if [ ${#missing[@]} -gt 0 ]; then
        warn "缺少工具: ${missing[*]}"
        log "尝试安装..."
        apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y ${missing[*]}
    fi
    
    # 检查Certbot
    if ! command -v certbot &> /dev/null; then
        log "安装 Certbot..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
    fi
    
    log "依赖检查完成"
}

# 配置定时任务
setup_cron() {
    step "配置定时任务..."
    
    # 创建临时crontab文件
    local cron_file="/tmp/ptool-monitoring.cron"
    
    cat > "$cron_file" << 'EOF'
# PTool 运维自动化定时任务

# 健康监控 - 每5分钟执行一次
*/5 * * * * /opt/ptool/server-version/scripts/monitoring/health-monitor.sh run >> /var/log/ptool/monitoring/health-monitor-cron.log 2>&1

# 自动恢复 - 每分钟执行一次
* * * * * /opt/ptool/server-version/scripts/monitoring/auto-heal.sh heal >> /var/log/ptool/monitoring/auto-heal-cron.log 2>&1

# 日志管理 - 每天凌晨1点执行
0 1 * * * /opt/ptool/server-version/scripts/monitoring/log-manager.sh daily >> /var/log/ptool/monitoring/log-manager-cron.log 2>&1

# SSL证书续期检查 - 每周一凌晨3点
0 3 * * 1 /opt/ptool/server-version/scripts/monitoring/ssl-manager.sh renew >> /var/log/ptool/monitoring/ssl-renew-cron.log 2>&1

# 全量备份 - 每天凌晨2点执行
0 2 * * * /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh full >> /var/log/ptool/monitoring/backup-cron.log 2>&1

# 增量 WAL tar 备份已暂停，直到完成正式 PITR 链路

# 最新全量备份校验 - 每周日凌晨4点
0 4 * * 0 /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh verify-latest >> /var/log/ptool/monitoring/backup-verify-cron.log 2>&1

# 清理旧日志 - 每周日凌晨5点
0 5 * * 0 find /var/log/ptool/monitoring -name "*.log" -mtime +30 -delete
EOF

    # 安装crontab
    crontab "$cron_file"
    rm -f "$cron_file"
    
    # 确保cron服务运行
    systemctl enable cron
    systemctl start cron
    
    log "定时任务配置完成"
}

# 创建配置文件模板
create_config_templates() {
    step "创建配置文件模板..."
    
    # 监控配置
    cat > "$MONITORING_DIR/monitor-config.env" << 'EOF'
# PTool 监控配置

# 告警阈值
CPU_THRESHOLD=80
MEM_THRESHOLD=85
DISK_THRESHOLD=90
LOAD_THRESHOLD=4
CONN_THRESHOLD=15

# 告警通知 (可选)
# ALERT_WEBHOOK="https://hooks.slack.com/services/..."
# ALERT_EMAIL="admin@example.com"

# API检查配置
API_URL="http://localhost"
API_TIMEOUT=10

# 数据库配置
DB_NAME="ptool"
DB_USER="ptool"

# SSL域名 (可选)
# DOMAIN="your-domain.com"
EOF
    
    # 备份配置
    cat > "$MONITORING_DIR/backup-config.env" << 'EOF'
# PTool 备份配置

# 基础配置
DB_NAME="ptool"
DB_USER="ptool"
RETENTION_DAYS=30

# 加密配置
ENABLE_ENCRYPTION=true
# BACKUP_ENCRYPTION_KEY="your-32-byte-key"  # 必须通过受保护的 ignored 配置注入

# 远程存储配置 (可选)
# REMOTE_TYPE="cos"  # s3, cos, oss, scp
# REMOTE_ENDPOINT="https://cos.ap-guangzhou.myqcloud.com"
# REMOTE_BUCKET="your-bucket-name"
# REMOTE_ACCESS_KEY="your-access-key"
# REMOTE_SECRET_KEY="your-secret-key"

# 备份通知 (可选)
# BACKUP_WEBHOOK="https://hooks.slack.com/services/..."
EOF

    # 部署配置
    cat > "$MONITORING_DIR/deploy-config.env" << 'EOF'
# PTool CI/CD 部署配置

APP_NAME="ptool"
APP_DIR="/opt/ptool"
DEPLOY_USER="deploy"
GIT_REPO=""
GIT_BRANCH="main"
DEPLOY_ENV="production"

KEEP_RELEASES=5
HEALTH_CHECK_TIMEOUT=60
ROLLBACK_ON_FAILURE=true

# 部署通知 (可选)
# DEPLOY_WEBHOOK="https://hooks.slack.com/services/..."
EOF

    chmod 600 "$MONITORING_DIR"/*.env
    
    log "配置文件模板创建完成"
}

# 创建systemd服务
setup_systemd_services() {
    step "创建Systemd服务..."
    
    # 健康监控服务
    cat > /etc/systemd/system/ptool-health-monitor.service << 'EOF'
[Unit]
Description=PTool Health Monitor
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/ptool/server-version/scripts/monitoring/health-monitor.sh run
User=root
StandardOutput=journal
StandardError=journal
EOF

    # 自动恢复服务
    cat > /etc/systemd/system/ptool-auto-heal.service << 'EOF'
[Unit]
Description=PTool Auto Heal
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/ptool/server-version/scripts/monitoring/auto-heal.sh heal
User=root
StandardOutput=journal
StandardError=journal
EOF

    # 定时器 - 健康监控
    cat > /etc/systemd/system/ptool-health-monitor.timer << 'EOF'
[Unit]
Description=Run PTool Health Monitor every 5 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

    # 定时器 - 自动恢复
    cat > /etc/systemd/system/ptool-auto-heal.timer << 'EOF'
[Unit]
Description=Run PTool Auto Heal every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
EOF

    # 重载并启用
    systemctl daemon-reload
    systemctl enable ptool-health-monitor.timer
    systemctl enable ptool-auto-heal.timer
    systemctl start ptool-health-monitor.timer
    systemctl start ptool-auto-heal.timer
    
    log "Systemd服务创建完成"
}

# 创建快捷命令
setup_aliases() {
    step "创建快捷命令..."
    
    cat > /usr/local/bin/ptool-ops << 'EOF'
#!/bin/bash
# PTool 运维快捷命令

case "$1" in
    status|s)
        /opt/ptool/server-version/scripts/monitoring/ops-dashboard.sh report
        ;;
    dashboard|d)
        /opt/ptool/server-version/scripts/monitoring/ops-dashboard.sh dashboard
        ;;
    health|h)
        /opt/ptool/server-version/scripts/monitoring/health-monitor.sh run
        ;;
    heal)
        /opt/ptool/server-version/scripts/monitoring/auto-heal.sh heal
        ;;
    backup|b)
        /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh full
        ;;
    backup-list|bl)
        /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh list
        ;;
    deploy)
        /opt/ptool/server-version/scripts/deploy-ci-cd.sh deploy
        ;;
    rollback|r)
        /opt/ptool/server-version/scripts/deploy-ci-cd.sh rollback
        ;;
    logs|l)
        tail -f /var/log/ptool/monitoring/health.log
        ;;
    alerts|a)
        tail -f /var/log/ptool/monitoring/alerts.log
        ;;
    ssl)
        /opt/ptool/server-version/scripts/monitoring/ssl-manager.sh info
        ;;
    help|--help|-h)
        echo "PTool 运维命令"
        echo ""
        echo "用法: ptool-ops [命令]"
        echo ""
        echo "系统管理:"
        echo "  status,  s       显示系统状态报告"
        echo "  dashboard, d     启动交互式仪表盘"
        echo "  health, h        运行健康检查"
        echo "  heal             执行自动修复"
        echo ""
        echo "备份管理:"
        echo "  backup, b        执行全量备份"
        echo "  backup-list, bl  列出所有备份"
        echo ""
        echo "部署管理:"
        echo "  deploy           执行完整部署"
        echo "  rollback, r      回滚到上一版本"
        echo ""
        echo "日志查看:"
        echo "  logs, l          查看健康日志"
        echo "  alerts, a        查看告警日志"
        echo ""
        echo "SSL管理:"
        echo "  ssl              显示SSL证书信息"
        echo ""
        ;;
    *)
        echo "未知命令: $1"
        echo "使用 'ptool-ops help' 查看帮助"
        exit 1
        ;;
esac
EOF

    chmod +x /usr/local/bin/ptool-ops
    
    log "快捷命令创建完成: ptool-ops"
}

# 执行测试
run_tests() {
    step "运行安装测试..."
    
    log "测试健康检查脚本..."
    "$MONITORING_DIR/health-monitor.sh" check || warn "健康检查测试失败"
    
    log "测试自动恢复脚本..."
    "$MONITORING_DIR/auto-heal.sh" check || warn "自动恢复测试失败"
    
    log "测试备份脚本..."
    "$MONITORING_DIR/backup-enhanced.sh" list || warn "备份列表失败"
    
    log "测试完成"
}

# 显示安装信息
show_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║         PTool 运维自动化系统 - 安装完成                  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo "📁 安装位置:"
    echo "   脚本目录: $MONITORING_DIR"
    echo "   日志目录: $LOG_DIR"
    echo "   备份目录: /backup/ptool"
    echo ""
    echo "⚡ 快捷命令:"
    echo "   ptool-ops status    - 查看系统状态"
    echo "   ptool-ops dashboard - 启动交互式仪表盘"
    echo "   ptool-ops backup    - 执行备份"
    echo "   ptool-ops deploy    - 执行部署"
    echo "   ptool-ops help      - 查看所有命令"
    echo ""
    echo "⏰ 定时任务:"
    echo "   健康监控: 每5分钟"
    echo "   自动恢复: 每分钟"
    echo "   全量备份: 每天凌晨2点"
    echo "   SSL续期: 每周一凌晨3点"
    echo ""
    echo "📋 配置文件 (请根据环境修改):"
    echo "   $MONITORING_DIR/monitor-config.env"
    echo "   $MONITORING_DIR/backup-config.env"
    echo "   $MONITORING_DIR/deploy-config.env"
    echo ""
    echo "📖 查看日志:"
    echo "   tail -f $LOG_DIR/health.log"
    echo "   tail -f $LOG_DIR/alerts.log"
    echo ""
    echo "⚠️  重要提醒:"
    echo "   1. 请编辑配置文件设置正确的参数"
    echo "   2. 建议配置 Webhook 接收告警通知"
    echo "   3. 建议配置远程备份存储"
    echo "   4. 建议配置 SSL 证书自动续期"
    echo ""
    echo "🔧 手动测试:"
    echo "   ptool-ops status"
    echo ""
}

# 主函数
main() {
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║      PTool 运维自动化系统 - 安装程序                     ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    
    check_root
    setup_directories
    set_permissions
    install_dependencies
    setup_cron
    create_config_templates
    setup_systemd_services
    setup_aliases
    run_tests
    show_summary
}

# 如果直接运行则执行安装
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main
fi
LEGACY_SCRIPT
