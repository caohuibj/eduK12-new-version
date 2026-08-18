# PTool Webhook 告警配置指南

## 📱 支持的告警渠道

- 企业微信 (推荐国内用户)
- 钉钉 (推荐国内用户)
- Slack (推荐国际用户)
- 邮件

---

## 🔧 配置步骤

### 1. 企业微信配置

#### 获取 Webhook 地址

1. 打开企业微信群聊
2. 点击右上角「群设置」
3. 选择「添加群机器人」
4. 点击「新创建一个机器人」
5. 填写机器人名称（如：PTool监控）
6. 复制 Webhook 地址

#### 配置到 PTool

```bash
# 编辑配置文件
nano /opt/ptool/server-version/scripts/monitoring/monitor-config.env

# 添加企业微信Webhook
WECHAT_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的密钥"
```

#### 测试

```bash
/opt/ptool/server-version/scripts/monitoring/send-alert.sh test
```

---

### 2. 钉钉配置

#### 获取 Webhook 地址

1. 打开钉钉群聊
2. 点击「群设置」->「智能群助手」
3. 点击「添加机器人」
4. 选择「自定义」机器人
5. 填写机器人名称（如：PTool监控）
6. 选择安全设置（建议加签或IP白名单）
7. 复制 Webhook 地址

#### 配置到 PTool

```bash
# 编辑配置文件
nano /opt/ptool/server-version/scripts/monitoring/monitor-config.env

# 添加钉钉Webhook
DINGTALK_WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=你的密钥"
```

#### 测试

```bash
/opt/ptool/server-version/scripts/monitoring/send-alert.sh test
```

---

### 3. Slack 配置

#### 创建 Incoming Webhook

1. 访问 https://api.slack.com/messaging/webhooks
2. 点击「Create your Slack app」
3. 选择「From scratch」
4. 填写 App Name 和 Workspace
5. 点击「Incoming Webhooks」
6. 开启「Activate Incoming Webhooks」
7. 点击「Add New Webhook to Workspace」
8. 选择要发送消息的频道
9. 复制 Webhook URL

#### 配置到 PTool

```bash
# 编辑配置文件
nano /opt/ptool/server-version/scripts/monitoring/monitor-config.env

# 添加Slack Webhook
ALERT_WEBHOOK="https://hooks.slack.com/services/你的/密钥"
```

---

### 4. 邮件配置

```bash
# 编辑配置文件
nano /opt/ptool/server-version/scripts/monitoring/monitor-config.env

# 添加邮件地址
ALERT_EMAIL="admin@yourcompany.com"
```

---

## 🧪 测试告警

### 测试所有配置渠道

```bash
/opt/ptool/server-version/scripts/monitoring/send-alert.sh test
```

### 发送自定义测试消息

```bash
# 发送到所有渠道
/opt/ptool/server-version/scripts/monitoring/send-alert.sh send CRITICAL "测试告警" "这是一条测试消息"

# 只发送到企业微信
/opt/ptool/server-version/scripts/monitoring/send-alert.sh wechat WARNING "CPU告警" "CPU使用率达到85%"

# 只发送到钉钉
/opt/ptool/server-version/scripts/monitoring/send-alert.sh dingtalk INFO "备份完成" "每日备份已成功完成"
```

---

## 📊 告警触发场景

配置完成后，以下场景会自动发送告警：

| 场景 | 告警级别 | 通知方式 |
|------|---------|---------|
| CPU > 80% | WARNING | 所有渠道 |
| 内存 > 85% | WARNING | 所有渠道 |
| 磁盘 > 90% | CRITICAL | 所有渠道 |
| API服务异常 | CRITICAL | 所有渠道 |
| 暴力破解攻击 | CRITICAL | 所有渠道 |
| 自动封禁IP | CRITICAL | 所有渠道 |
| 备份失败 | CRITICAL | 所有渠道 |
| SSL证书即将过期 | WARNING | 所有渠道 |

---

## 🔒 安全建议

1. **Webhook 密钥保护**：不要将 Webhook 密钥提交到 Git 仓库
2. **IP 白名单**：在钉钉/企业微信中设置 IP 白名单
3. **定期轮换**：定期更换 Webhook 密钥
4. **访问控制**：配置文件设置权限 `chmod 600 monitor-config.env`

---

## ❓ 常见问题

### Q: 测试发送成功但没有收到消息？

- 检查机器人是否被禁言
- 检查网络连接
- 查看群消息免打扰设置

### Q: 如何配置多个群接收告警？

```bash
# 多个企业微信群
WECHAT_WEBHOOK_1="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=密钥1"
WECHAT_WEBHOOK_2="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=密钥2"
```

### Q: 如何只发送严重告警？

修改监控脚本，在发送前检查告警级别：
```bash
if [ "$ALERT_LEVEL" == "CRITICAL" ]; then
    /opt/ptool/server-version/scripts/monitoring/send-alert.sh send ...
fi
```

---

## 📞 获取帮助

如有问题，请检查：
1. `/var/log/ptool/monitoring/` 目录下的日志文件
2. Webhook 配置是否正确
3. 网络连接是否正常
