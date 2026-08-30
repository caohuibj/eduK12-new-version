# 云服务器部署方案

> **当前生产发布安全顺序（PR #30 及以后）**：本项目唯一支持的生产拓扑是
> `docker compose`。迁移会添加 `NOT VALID` 约束；它不会检查历史行，但仍会拦截
> 后续写入。因此升级时必须先在入口/负载均衡处停止并排空旧 backend、worker 和
> public traffic，再停止旧 `backend`/`frontend` 容器。然后按下面顺序执行：
> **备份 → guarded migration → 四类 public bearer token 回填 → 确认四类
> `remaining=0` → `release-preflight`（八个 token 约束全部已验证）→ 构建并启动
> 新版本 → 每个已启用 public workflow 各做一次 smoke → 恢复入口流量**。
> 在回填和 preflight 完成前，不得重新启动旧版本服务。旧的宿主机/PM2 部署脚本
> 和本文末尾的旧示例仅供历史参考，不得执行。

## 1. 服务器配置建议

### 最低配置（20-30并发，功能验证）
| 配置项 | 建议 |
|--------|------|
| **CPU** | 2核 |
| **内存** | 4GB |
| **存储** | 50GB SSD |
| **带宽** | 5Mbps |
| **系统** | Ubuntu 22.04 LTS / CentOS 8 |

### 预估费用（阿里云/腾讯云）
- **轻量应用服务器**: 约 50-100元/月
- **云服务器ECS**: 约 100-200元/月
- **学生优惠**: 约 10-30元/月（有教育认证）

## 2. 部署架构

```
┌─────────────────────────────────────────┐
│           云服务器 (2核4G)               │
│  ┌─────────────────────────────────┐    │
│  │         Nginx (反向代理)          │    │
│  │           Port 80                │    │
│  └─────────────┬───────────────────┘    │
│                │                         │
│       ┌────────┴────────┐                │
│       ▼                 ▼                │
│  ┌─────────┐       ┌─────────┐          │
│  │ Frontend│       │ Backend │          │
│  │  (静态)  │       │ Port 3000│          │
│  └─────────┘       └────┬────┘          │
│                         │                │
│                    ┌────┴────┐           │
│                    ▼         ▼           │
│              ┌────────┐  ┌────────┐      │
│              │PostgreSQL│  │本地存储 │      │
│              │ Port 5432│  │/uploads│      │
│              └────────┘  └────────┘      │
└─────────────────────────────────────────┘
```

## 3. 阿里云部署步骤

### 方式一：ECS + Docker（推荐）

```bash
# 1. 购买 ECS 实例（2核4G，Ubuntu 22.04）
# 2. 连接到服务器
ssh root@your-server-ip

# 3. 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 4. 安装 Docker Compose
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# 5. 上传项目文件
# 使用 SCP 或 Git 克隆
scp -r server-version root@your-server-ip:/opt/

# 6. 首次启动（没有旧流量；升级请改用“更新部署”顺序）
cd /opt/server-version
cp .env.example .env
# 编辑 .env 文件：填写 DB_*、完整且已 percent-encode 的 DATABASE_URL、JWT/加密密钥、CORS 和管理员凭据
docker compose up -d postgres redis
docker compose build backend frontend migrate checkin-token-backfill release-preflight
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm seed  # 首次/明确需要时
docker compose --profile ops run --rm checkin-token-backfill
docker compose --profile ops run --rm release-preflight
docker compose up -d backend frontend
# smoke questionnaire/check-in/composite/cognitive 中已启用的每类 public link，确认后再恢复入口流量

# 7. 配置安全组
# 阿里云控制台 -> 安全组 -> 添加规则
# 入方向: 允许 80, 443 端口
```

### 方式二：轻量应用服务器（更简单）

1. 购买轻量应用服务器（Docker 镜像）。
2. 直接上传项目并填写 `.env`。
3. 首次部署按“方式一”第 6 步；升级按“更新部署”的 drain/stop → 备份 →
   migration → 四类 token backfill → preflight → build/start → smoke 顺序。

## 4. 腾讯云部署步骤

```bash
# 1. 购买轻量应用服务器或 CVM
# 2. 安装 Docker（同阿里云步骤）
# 3. 上传项目并启动

# 腾讯云 CLI 部署（可选）
# 安装腾讯云 CLI: https://cloud.tencent.com/document/product/440/34011

# 登录
tccli configure

# 创建轻量应用服务器（需要提前准备好镜像）
# 目前 CLI 不支持直接部署容器，建议使用控制台或 SSH 部署
```

## 5. 域名和 HTTPS（可选）

```bash
# 1. 购买域名并解析到服务器 IP

# 2. 安装 certbot 获取免费 SSL 证书
apt-get install certbot python3-certbot-nginx

# 3. 获取证书
certbot --nginx -d your-domain.com

# 4. 自动续期（已默认配置）
```

## 6. 监控和维护

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 备份数据库
docker exec ptool-postgres pg_dump -U ptool ptool > backup.sql

# 恢复数据库
docker exec -i ptool-postgres psql -U ptool ptool < backup.sql

# 更新部署
git pull
# 先在入口/负载均衡处 drain，并停止所有旧 API/worker/public traffic；不要让旧代码
# 在 NOT VALID 约束已创建而 token 尚未回填的窗口继续写数据库。
docker compose stop frontend backend
docker exec ptool-postgres pg_dump -U <DB_USER> <DB_NAME> > backup-$(date -u +%Y%m%dT%H%M%SZ).sql
docker compose build backend frontend migrate checkin-token-backfill release-preflight
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm checkin-token-backfill
docker compose --profile ops run --rm release-preflight
docker compose up -d backend frontend
# 完成四类 public workflow smoke 后，才恢复入口/负载均衡流量。
```

## 7. 性能优化（初期可跳过）

```nginx
# nginx.conf 优化
worker_processes auto;
worker_connections 1024;

# 启用 gzip
gzip on;
gzip_types text/plain text/css application/json application/javascript;

# 静态文件缓存
location /uploads/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

## 8. 常见问题

### Q: 数据库连接失败？
```bash
# 检查 PostgreSQL 是否启动
docker-compose ps

# 查看数据库日志
docker-compose logs postgres
```

### Q: 文件上传失败？
```bash
# 检查上传目录权限
docker exec ptool-backend ls -la /app/uploads

# 重启服务
docker-compose restart backend
```

### Q: 如何更新代码？
```bash
# 拉取最新代码
git pull

# 按上面的“更新部署”安全顺序执行：drain/stop → backup → migrate →
# public-token backfill → release-preflight → build/start → public smoke → reopen。
```

## 9. 一键部署脚本

```bash
#!/bin/bash
# deploy.sh

set -e

echo "=== 开始部署 PTool ==="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "安装 Docker Compose..."
    pip3 install docker-compose
fi

# 创建目录
mkdir -p /opt/ptool
cd /opt/ptool

# 下载项目（假设使用 Git）
# git clone https://your-repo.git .

# 配置环境变量
if [ ! -f .env ]; then
    cp .env.example .env
    # 生成随机 JWT 密钥
    sed -i "s/your-secret-key-change-in-production/$(openssl rand -hex 32)/g" .env
fi

# 迁移、初始化管理员/内置配置并启动服务
docker compose down 2>/dev/null || true
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm seed
docker compose up -d backend frontend

# 等待服务启动
sleep 10

# 检查状态
if docker-compose ps | grep -q "Up"; then
    echo "=== 部署成功 ==="
    echo "访问地址: http://$(curl -s ifconfig.me)"
    echo "管理员账号: 使用 .env 中配置的 ADMIN_USERNAME / ADMIN_PASSWORD"
else
    echo "=== 部署失败，请检查日志 ==="
    docker-compose logs
fi
```

## 10. 联系方式

如有部署问题，请检查：
1. Docker 和 Docker Compose 版本
2. 服务器安全组配置
3. 环境变量配置
4. 日志输出
