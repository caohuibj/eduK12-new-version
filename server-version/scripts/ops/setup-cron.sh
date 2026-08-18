#!/bin/bash
# =============================================================================
# PTool 定时任务配置脚本
# 功能: 一键配置所有监控脚本的定时任务
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_DIR="${SCRIPT_DIR}/../monitoring"
OPS_DIR="${SCRIPT_DIR}"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 初始化目录
init_directories() {
    print_info "初始化日志和备份目录..."
    
    # 创建日志目录
    sudo mkdir -p /var/log/ptool/{monitoring,security,performance}
    sudo mkdir -p /backup/ptool/{local,encrypted}
    
    # 设置权限
    sudo chown -R $USER:$USER /var/log/ptool
    sudo chmod 755 /var/log/ptool
    sudo chmod 700 /backup/ptool
    
    print_info "目录初始化完成"
}

# 配置定时任务
setup_cron() {
    print_info "配置定时任务..."
    
    # 创建临时crontab文件
    local temp_cron=$(mktemp)
    
    # 保留现有的非PTool相关任务
    crontab -l 2>/dev/null | grep -v "ptool" | grep -v "PTool" > "$temp_cron" || true
    
    # 添加PTool监控任务
    cat >> "$temp_cron" << 'EOF'
# =============================================================================
# PTool 自动运维定时任务
# =============================================================================

# 健康监控 - 每5分钟
*/5 * * * * /opt/ptool/server-version/scripts/monitoring/health-monitor.sh run >> /var/log/ptool/monitoring/cron-health.log 2>&1

# 自动恢复 - 每1分钟
* * * * * /opt/ptool/server-version/scripts/monitoring/auto-heal.sh heal >> /var/log/ptool/monitoring/cron-heal.log 2>&1

# 安全监控 - 每5分钟
*/5 * * * * /opt/ptool/server-version/scripts/ops/security-monitor.sh run >> /var/log/ptool/security/cron-security.log 2>&1

# 性能监控 - 每10分钟
*/10 * * * * /opt/ptool/server-version/scripts/ops/performance-monitor.sh run >> /var/log/ptool/performance/cron-perf.log 2>&1

# 全量备份 - 每天凌晨2点
0 2 * * * /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh full >> /var/log/ptool/monitoring/cron-backup.log 2>&1

# 增量备份 - 每小时
0 * * * * /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh incremental >> /var/log/ptool/monitoring/cron-backup.log 2>&1

# 日志管理 - 每天凌晨3点
0 3 * * * /opt/ptool/server-version/scripts/monitoring/log-manager.sh rotate >> /var/log/ptool/monitoring/cron-log.log 2>&1

# 清理旧日志 - 每周日凌晨4点
0 4 * * 0 /opt/ptool/server-version/scripts/monitoring/log-manager.sh cleanup >> /var/log/ptool/monitoring/cron-log.log 2>&1

# =============================================================================
EOF
    
    # 安装新的crontab
    crontab "$temp_cron"
    rm -f "$temp_cron"
    
    print_info "定时任务配置完成"
}

# 显示配置信息
show_config() {
    echo ""
    echo "========================================"
    echo "  PTool 定时任务配置完成"
    echo "========================================"
    echo ""
    echo "已配置的任务:"
    echo ""
    echo "  每1分钟   - 自动故障恢复"
    echo "  每5分钟   - 健康监控 + 安全监控"
    echo "  每10分钟  - 性能监控"
    echo "  每小时    - 增量备份"
    echo "  每天2点   - 全量备份"
    echo "  每天3点   - 日志轮转"
    echo "  每周日4点 - 清理旧日志"
    echo ""
    echo "日志位置:"
    echo "  /var/log/ptool/monitoring/"
    echo "  /var/log/ptool/security/"
    echo "  /var/log/ptool/performance/"
    echo ""
    echo "备份位置:"
    echo "  /backup/ptool/encrypted/"
    echo ""
    echo "查看定时任务: crontab -l"
    echo "查看监控日志: tail -f /var/log/ptool/monitoring/cron-health.log"
    echo "========================================"
}

# 测试运行
test_scripts() {
    print_warn "测试监控脚本..."
    
    print_info "测试健康监控..."
    sudo ${MONITOR_DIR}/health-monitor.sh check || print_warn "健康监控测试失败"
    
    print_info "测试安全监控..."
    sudo ${OPS_DIR}/security-monitor.sh check-login || print_warn "安全监控测试失败"
    
    print_info "测试性能监控..."
    sudo ${OPS_DIR}/performance-monitor.sh trends || print_warn "性能监控测试失败"
    
    print_info "脚本测试完成"
}

# 主函数
main() {
    echo "========================================"
    echo "  PTool 定时任务配置"
    echo "========================================"
    echo ""
    
    # 确认
    read -p "是否继续配置定时任务? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        echo "已取消"
        exit 0
    fi
    
    # 执行配置
    init_directories
    setup_cron
    
    # 询问是否测试
    read -p "是否测试监控脚本? (y/n): " test_confirm
    if [ "$test_confirm" == "y" ]; then
        test_scripts
    fi
    
    show_config
}

# 根据参数执行
case "${1:-setup}" in
    setup)
        main
        ;;
    show)
        crontab -l | grep -A 100 "PTool"
        ;;
    remove)
        print_warn "移除所有PTool定时任务..."
        crontab -l 2>/dev/null | grep -v "ptool" | grep -v "PTool" | crontab -
        print_info "已移除所有PTool定时任务"
        ;;
    *)
        echo "用法: $0 [setup|show|remove]"
        exit 1
        ;;
esac
