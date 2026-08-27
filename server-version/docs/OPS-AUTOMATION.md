# PTool 运维自动化系统

> 当前状态（2026-08-26）：本文下方保留的宿主机、PM2、sudo、cron、COS 和
> 自动修复示例仅作历史参考，相关脚本已停用并会 fail-fast。当前 PR 的支持
> 范围是本地 Docker Compose；备份请使用 `docs/BACKUP-RESTORE.md` 中的统一
> Node 入口。生产服务器和 COS 尚未配置，不要执行本文的宿主机运维命令。

## 系统概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     PTool 运维自动化系统                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  监控告警    │  │  自动恢复    │  │  日志管理    │          │
│  │  (5分钟)     │  │  (1分钟)     │  │  (每日)      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                  │
│         └─────────────────┼─────────────────┘                  │
│                           ▼                                    │
│                  ┌─────────────────┐                          │
│                  │   统一日志中心   │                          │
│                  │  /var/log/ptool │                          │
│                  └────────┬────────┘                          │
│                           │                                    │
│  ┌──────────────┐  ┌──────┴──────┐  ┌──────────────┐          │
│  │  SSL证书     │  │  备份系统   │  │  CI/CD部署   │          │
│  │  (每周)      │  │  (每日)     │  │  (手动/自动) │          │
│  └──────────────┘  └─────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              运维 Dashboard (CLI/Web)                 │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 当前本地入口

```bash
# 在仓库根目录启动本地 Compose（按本机 .env.example 准备 ignored 配置）
cd <repo-root>
docker compose --env-file server-version/.env \
  -f server-version/docker-compose.yml up -d
```

监控 Compose 仅用于本地观察，端口默认绑定到 `127.0.0.1`；应用对外入口是
前端的 `http://localhost/`，后端健康检查为容器内 `/ready`，指标入口为
容器内 `/metrics`。数据库和 Redis 不发布宿主机端口。

### 2. 配置边界

```bash
# 本地只使用 ignored 的环境文件或进程环境变量；不要创建并提交配置备份
# 备份密钥必须通过 BACKUP_ENCRYPTION_KEY 注入
# COS、远程 webhook、生产域名和宿主机 cron 均不属于当前本地测试范围
```

### 一次性凭据交接文件

密码重置接口只返回受保护交接文件的文件名，不会把临时密码放入 API
响应、日志、数据库或 `/uploads`。Docker Compose 后端将交接目录挂载到
`/app/.local` 的独立命名卷；本地读取示例：

```bash
docker compose --env-file server-version/.env \
  -f server-version/docker-compose.yml cp \
  ptool-backend:/app/.local/<handoff-file>.json ./<handoff-file>.json
chmod 600 ./<handoff-file>.json
```

交付后立即删除副本和容器内文件；系统默认清理超过 24 小时的交接文件，
`CREDENTIAL_HANDOFF_TTL_HOURS` 最多允许配置为 7 天。不要把该文件复制到
上传目录、提交 Git 或发送到聊天工具。当前尚未配置生产服务器；上述流程
仅用于本地测试。

### 3. 查看状态

```bash
docker compose --env-file server-version/.env \
  -f server-version/docker-compose.yml ps
```

下方旧组件说明、快捷命令和定时任务不构成当前部署步骤；涉及已停用脚本的
命令不应在本地执行。

## 组件详解

### 1. 健康监控 (health-monitor.sh)

**功能：**
- CPU、内存、磁盘使用率监控
- API服务健康检查
- 数据库连接数监控
- SSL证书过期检查
- 多渠道告警 (Webhook/邮件/系统日志)

**配置：**
```bash
# monitor-config.env
CPU_THRESHOLD=80           # CPU告警阈值
MEM_THRESHOLD=85           # 内存告警阈值
DISK_THRESHOLD=90          # 磁盘告警阈值
ALERT_WEBHOOK=""           # 告警Webhook URL
ALERT_EMAIL=""             # 告警邮箱
```

**使用：**
```bash
# 立即执行检查
./scripts/monitoring/health-monitor.sh run

# 仅检查，不告警
./scripts/monitoring/health-monitor.sh check

# 生成JSON报告
./scripts/monitoring/health-monitor.sh report

# 测试告警通道
./scripts/monitoring/health-monitor.sh test-alert
```

**定时任务：** 每5分钟自动执行

### 2. 自动恢复 (auto-heal.sh)

**功能：**
- 服务故障自动检测
- 自动重启服务 (Nginx/PostgreSQL/Redis/API)
- 资源清理 (磁盘/内存/僵尸进程)
- 防频繁重启保护 (5分钟内最多3次)

**使用：**
```bash
# 执行自动恢复
./scripts/monitoring/auto-heal.sh heal

# 仅检查状态
./scripts/monitoring/auto-heal.sh check

# 修复常见问题
./scripts/monitoring/auto-heal.sh fix
```

**定时任务：** 每分钟自动执行

### 3. 日志管理 (log-manager.sh)

**功能：**
- 日志自动轮转 (Nginx/PM2/应用日志)
- 日志压缩归档
- 日志分析报表
- 自动清理旧日志 (保留30天)

**使用：**
```bash
# 执行每日日志管理
./scripts/monitoring/log-manager.sh daily

# 仅轮转日志
./scripts/monitoring/log-manager.sh rotate

# 查看实时日志
./scripts/monitoring/log-manager.sh monitor

# 搜索日志
./scripts/monitoring/log-manager.sh search "error"

# 生成分析报告
./scripts/monitoring/log-manager.sh analyze
```

**定时任务：** 每天凌晨1点执行

### 4. SSL证书管理 (ssl-manager.sh)

**功能：**
- 自动申请 Let's Encrypt 证书
- 自动续期检查
- 续期前告警 (7天/30天)
- Nginx自动重载

**配置：**
```bash
# 设置域名
export DOMAIN="your-domain.com"
export ADMIN_EMAIL="admin@your-domain.com"
```

**使用：**
```bash
# 申请新证书
./scripts/monitoring/ssl-manager.sh obtain

# 续期检查
./scripts/monitoring/ssl-manager.sh renew

# 查看证书信息
./scripts/monitoring/ssl-manager.sh info

# 测试续期流程
./scripts/monitoring/ssl-manager.sh test

# 设置自动续期定时任务
./scripts/monitoring/ssl-manager.sh setup-cron
```

**定时任务：** 每周一凌晨3点执行

### 5. 备份系统（统一入口）

旧的 shell 实现已经停用；`backup-enhanced.sh` 仅转发到统一 Node 入口。
当前只支持加密数据库包、实际解密校验和隔离 PostgreSQL 恢复。WAL tar
增量备份、多地上传、宿主机恢复和自动清理暂不支持。

```bash
cd server-version/backend
BACKUP_ENCRYPTION_KEY='只在当前进程中注入的本地测试密钥' npm run backup:db
BACKUP_ENCRYPTION_KEY='只在当前进程中注入的本地测试密钥' npm run verify:backup
```

完整参数和恢复命令见 `docs/BACKUP-RESTORE.md`。本地验证时请显式指定
`eduk12-dev-pg`、`eduk12_dev` 等测试目标，禁止把可丢弃数据库重置流程用于
Compose 的 `ptool` 数据库。

### 6. CI/CD 自动化部署 (deploy-ci-cd.sh)

**功能：**
- 预部署环境检查
- 版本管理与回滚
- 自动构建与测试
- 健康检查验证
- 失败自动回滚

**配置：**
```bash
# deploy-config.env
GIT_REPO="https://github.com/..."
GIT_BRANCH="main"
KEEP_RELEASES=5
ROLLBACK_ON_FAILURE=true
```

**使用：**
```bash
# 初始化部署环境
./scripts/deploy-ci-cd.sh setup

# 完整部署 (检查→构建→测试→部署)
./scripts/deploy-ci-cd.sh deploy

# 快速部署 (跳过测试)
./scripts/deploy-ci-cd.sh quick

# 回滚到上一版本
./scripts/deploy-ci-cd.sh rollback

# 查看部署历史
./scripts/deploy-ci-cd.sh history

# 检查服务状态
./scripts/deploy-ci-cd.sh status
```

### 7. 运维 Dashboard (ops-dashboard.sh)

**功能：**
- 实时系统资源监控
- 服务状态可视化
- 交互式操作界面
- JSON格式输出

**使用：**
```bash
# 交互式仪表盘
./scripts/monitoring/ops-dashboard.sh dashboard

# 一次性报告
./scripts/monitoring/ops-dashboard.sh report

# JSON输出
./scripts/monitoring/ops-dashboard.sh json

# 快捷命令
ptool-ops dashboard
```

## 快捷命令参考

```bash
# 系统管理
ptool-ops status        # 显示系统状态报告
ptool-ops dashboard     # 启动交互式仪表盘
ptool-ops health        # 运行健康检查
ptool-ops heal          # 执行自动修复

# 备份管理
ptool-ops backup        # 执行全量备份
ptool-ops backup-list   # 列出所有备份

# 部署管理
ptool-ops deploy        # 执行完整部署
ptool-ops rollback      # 回滚到上一版本

# 日志查看
ptool-ops logs          # 查看健康日志
ptool-ops alerts        # 查看告警日志

# SSL管理
ptool-ops ssl           # 显示SSL证书信息
```

## 日志文件位置

```
/var/log/ptool/
├── monitoring/
│   ├── health.log              # 健康检查日志
│   ├── alerts.log              # 告警日志
│   ├── auto-heal.log           # 自动恢复日志
│   ├── backup.log              # 备份日志
│   ├── deploy.log              # 部署日志
│   └── health-report-*.json    # 健康报告
├── nginx/                      # Nginx日志
└── app.log                     # 应用日志
```

## 定时任务配置

```cron
# 健康监控 - 每5分钟
*/5 * * * * /opt/ptool/server-version/scripts/monitoring/health-monitor.sh run

# 本地 PR 不安装宿主机 cron。生产调度、通知和保留策略须另行审批并实现
# 受控的 Compose/备份运维入口后再配置。
```

## 告警配置示例

### Webhook (企业微信)

```bash
# monitor-config.env
ALERT_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
```

### 邮件告警

```bash
# 安装邮件工具
sudo apt-get install mailutils

# 配置SMTP
sudo nano /etc/mail.rc
# 添加:
# set smtp=smtp.gmail.com:587
# set smtp-auth=login
# set smtp-auth-user=your-email@gmail.com
# set smtp-auth-password=your-password
# set from=your-email@gmail.com

# monitor-config.env
ALERT_EMAIL="admin@example.com"
```

## 故障排查

### 监控脚本不执行

```bash
# 检查cron服务
sudo systemctl status cron

# 检查定时任务
sudo crontab -l

# 手动测试脚本
sudo bash /opt/ptool/server-version/scripts/monitoring/health-monitor.sh run
```

### 告警不发送

```bash
# 测试Webhook
curl -X POST "$ALERT_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{"text":"测试告警"}'

# 测试邮件
echo "测试邮件" | mail -s "测试" "$ALERT_EMAIL"
```

### 备份失败

```bash
# 检查磁盘空间
df -h

# 检查权限
ls -la /backup/ptool/

# 手动执行查看错误
sudo bash /opt/ptool/server-version/scripts/monitoring/backup-enhanced.sh full
```

## 性能优化建议

### 2C4G 服务器配置

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 健康检查间隔 | 5分钟 | 避免过于频繁 |
| 自动恢复间隔 | 1分钟 | 快速响应故障 |
| 备份时间 | 凌晨2点 | 避开高峰期 |
| 日志保留 | 30天 | 节省磁盘空间 |
| 备份保留 | 30天 | 符合合规要求 |

### 监控阈值建议

| 指标 | 警告 | 严重 |
|------|------|------|
| CPU | 60% | 80% |
| 内存 | 70% | 85% |
| 磁盘 | 80% | 90% |
| 负载 | 2.0 | 4.0 |
| 连接数 | 15 | 20 |

## 扩展功能

### 集成 Prometheus + Grafana

```yaml
# docker-compose.yml 添加
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
```

### 集成 ELK 日志分析

```yaml
# docker-compose.yml 添加
  elasticsearch:
    image: elasticsearch:8.x
    environment:
      - discovery.type=single-node

  logstash:
    image: logstash:8.x
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: kibana:8.x
    ports:
      - "5601:5601"
```

## 更新维护

```bash
# 更新监控脚本
cd /opt/ptool
sudo git pull origin main

# 重新安装
sudo bash server-version/scripts/monitoring/setup-monitoring.sh

# 验证安装
ptool-ops status
```
