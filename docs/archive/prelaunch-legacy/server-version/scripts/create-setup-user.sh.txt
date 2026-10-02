#!/bin/bash
# =============================================================================

cat >&2 <<'NOTICE'
此宿主机部署账号创建入口已停用。
仓库不再创建 sudo 免密、PM2、systemd 或 certbot 权限；生产主机账号和权限必须由外部运维流程审批。
NOTICE
exit 1

: <<'LEGACY_SCRIPT'
# 创建临时配置账号脚本
# 在服务器上运行此脚本，创建仅用于部署的受限账号
# =============================================================================

# 创建专用部署用户
sudo useradd -m -s /bin/bash codebuddy-setup

# 添加到sudo组
sudo usermod -aG sudo codebuddy-setup

# 设置密码（运行后手动设置）
echo "请设置 codebuddy-setup 用户的密码:"
sudo passwd codebuddy-setup

# 配置sudo免密（仅用于部署）
echo "codebuddy-setup ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/systemctl, /bin/systemctl, /usr/bin/pm2, /usr/bin/certbot" | sudo tee /etc/sudoers.d/codebuddy-setup

# 允许SSH密钥登录
sudo mkdir -p /home/codebuddy-setup/.ssh
sudo chmod 700 /home/codebuddy-setup/.ssh

# 显示SSH密钥配置命令
echo ""
LEGACY_SCRIPT
echo "=============================================="
echo "下一步：添加SSH公钥"
echo "=============================================="
echo "请运行以下命令添加公钥："
echo ""
echo "sudo nano /home/codebuddy-setup/.ssh/authorized_keys"
echo "# 粘贴公钥后保存"
echo ""
echo "然后设置权限："
echo "sudo chmod 600 /home/codebuddy-setup/.ssh/authorized_keys"
echo "sudo chown -R codebuddy-setup:codebuddy-setup /home/codebuddy-setup/.ssh"
echo ""
echo "完成后，可以使用密钥登录："
echo "ssh codebuddy-setup@140.143.146.97"
echo ""
