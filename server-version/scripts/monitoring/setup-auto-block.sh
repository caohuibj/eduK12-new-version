#!/bin/bash
# =============================================================================
# PTool 自动封禁系统安装脚本
# 功能: 配置开机自动恢复iptables规则和定时清理
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "  PTool 自动封禁系统安装"
echo "========================================"
echo ""

# 1. 创建iptables规则恢复服务
echo "[1/4] 创建iptables恢复服务..."

sudo tee /etc/systemd/system/iptables-restore.service > /dev/null << 'EOF'
[Unit]
Description=Restore iptables rules
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# 2. 启用服务
echo "[2/4] 启用iptables恢复服务..."
sudo systemctl daemon-reload
sudo systemctl enable iptables-restore.service

# 3. 确保日志目录权限正确
echo "[3/4] 配置日志目录..."
sudo mkdir -p /var/log/ptool/security
sudo chown -R $USER:$USER /var/log/ptool

# 4. 显示配置
echo "[4/4] 验证配置..."
echo ""
echo "========================================"
echo "  安装完成!"
echo "========================================"
echo ""
echo "配置信息:"
echo "  自动封禁脚本: /opt/ptool/server-version/scripts/monitoring/auto-block.sh"
echo "  配置文件: /opt/ptool/server-version/scripts/monitoring/monitor-config.env"
echo "  封禁日志: /var/log/ptool/security/blocked-ips.log"
echo "  iptables规则: /etc/iptables/rules.v4"
echo ""
echo "定时任务:"
echo "  每5分钟执行自动封禁检查"
echo "  每5分钟执行安全监控"
echo ""
echo "使用命令:"
echo "  sudo /opt/ptool/server-version/scripts/monitoring/auto-block.sh status  # 查看状态"
echo "  sudo /opt/ptool/server-version/scripts/monitoring/auto-block.sh list    # 列出封禁IP"
echo "  sudo /opt/ptool/server-version/scripts/monitoring/auto-block.sh block <ip>   # 手动封禁"
echo "  sudo /opt/ptool/server-version/scripts/monitoring/auto-block.sh unblock <ip> # 手动解封"
echo "========================================"
