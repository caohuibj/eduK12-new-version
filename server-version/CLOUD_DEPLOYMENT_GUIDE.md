# ☁️ 云端部署实战指南

> **已废弃：请勿按本文中的宿主机、PM2 或本地 PostgreSQL 步骤部署生产环境。**
> 当前唯一支持的生产拓扑是 `docker-compose.yml`：PostgreSQL 和 Redis 只加入内部 Compose 网络，
> 不发布宿主机端口；密钥通过受保护的 Compose `.env` 注入。本文仅保留云资源和域名规划参考，
> 具体启动、迁移、备份和恢复请以仓库中的 Compose 运维文档及脚本为准。

**目标环境**: 腾讯云轻量应用服务器 + COS + CDN  
**适用规模**: 100-300人教学场景  
**预计费用**: ¥300-400/月

---

## 📋 部署架构

```
用户请求
    │
    ▼
┌────────────────────────────────────────────┐
│  CDN (内容分发网络)                          │
│  • 图片/视频/JS/CSS 加速                    │
│  • 全球边缘节点缓存                          │
│  • 费用: ~¥0.05/GB                          │
└──────────────┬─────────────────────────────┘
               │
┌──────────────▼─────────────────────────────┐
│  腾讯云轻量服务器 (2C4G 5M)                 │
│  • Nginx (反向代理 + 静态缓存)              │
│  • Node.js API 服务                         │
│  • PostgreSQL 数据库                        │
│  • 费用: ~¥200/月                           │
└──────────────┬─────────────────────────────┘
               │
┌──────────────▼─────────────────────────────┐
│  COS 对象存储                               │
│  • 视频/大文件存储                          │
│  • 流量费用: ~¥0.15/GB                      │
│  • 存储费用: ~¥0.12/GB/月                   │
└────────────────────────────────────────────┘
```

---

## 🚀 快速部署步骤

### 第一步: 购买云资源

#### 1.1 轻量应用服务器
```
配置: 2核 CPU / 4G 内存 / 5M 带宽
系统: Ubuntu 22.04 LTS
地域: 选择离用户最近的地区
价格: ~¥200/月 (新用户有折扣)
```

#### 1.2 对象存储 COS
```
存储桶: ptool-uploads-<your-name>
地域: 与服务器相同
访问权限: 公有读私有写
```

#### 1.3 CDN 加速 (可选但推荐)
```
加速域名: static.yourdomain.com
源站: COS 存储桶
缓存策略: 图片/视频 30天
```

---

### 第二步: 服务器初始化

```bash
# 1. 连接服务器
ssh ubuntu@your-server-ip

# 2. 更新系统
sudo apt update && sudo apt upgrade -y

# 3. 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. 安装 PM2
sudo npm install -g pm2

# 5. 安装 PostgreSQL 14
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 6. 安装 Nginx
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 7. 安装 Git
sudo apt install -y git
```

---

### 第三步: 数据库配置（历史参考，不适用于当前生产环境）

```bash
# 1. 创建数据库用户
sudo -u postgres psql

# 2. 执行 SQL
CREATE DATABASE ptool;
CREATE USER ptool WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE ptool TO ptool;
\q

# 当前生产环境禁止将 PostgreSQL 监听到公网或使用全网段放行规则。
# 请使用 Docker Compose 内部的 postgres 服务名连接，不执行宿主机远程开放配置。
```

---

### 第四步: 部署后端（历史参考，不适用于当前生产环境）

```bash
# 1. 进入项目目录
cd /opt
sudo git clone https://github.com/your-repo/ptool.git
cd ptool/server-version/backend

# 2. 安装依赖
npm install

# 3. 配置环境变量
sudo nano .env
```

**环境变量配置**:
```bash
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://ptool:your-secure-password@localhost:5432/ptool?schema=public

# JWT (必须修改!)
JWT_SECRET=your-super-secret-key-at-least-32-characters-long
JWT_EXPIRES_IN=7d

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800

# Admin (必须修改!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password

# COS (从腾讯云控制台获取)
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_BUCKET=ptool-uploads-yourname
COS_REGION=ap-guangzhou
COS_DOMAIN=https://ptool-uploads-yourname.cos.ap-guangzhou.myqcloud.com
```

```bash
# 4. 数据库迁移
npx prisma migrate deploy
npx prisma generate
npm run db:seed

# 5. 构建
npm run build

# 当前生产环境不使用 PM2；请使用仓库根目录的 Docker Compose 生产入口。
```

---

### 第五步: 部署前端（历史参考，不适用于当前生产环境）

```bash
# 1. 进入前端目录
cd ../frontend

# 2. 安装依赖
npm install

# 3. 配置 API 地址
sudo nano .env.production
```

**前端环境变量**:
```bash
VITE_API_URL=https://yourdomain.com/api
VITE_COS_DOMAIN=https://ptool-uploads-yourname.cos.ap-guangzhou.myqcloud.com
```

```bash
# 4. 构建
npm run build

# 5. 移动到 Nginx 目录
sudo rm -rf /var/www/html/*
sudo cp -r dist/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html
```

---

### 第六步: Nginx 配置（历史参考，不适用于当前生产环境）

```bash
sudo nano /etc/nginx/sites-available/ptool
```

**Nginx 配置**:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # 前端静态文件
    location / {
        root /var/www/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
        
        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 上传文件大小限制
    client_max_body_size 500M;
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/ptool /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

### 第七步: HTTPS 配置 (Certbot)

```bash
# 1. 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 2. 申请证书
sudo certbot --nginx -d yourdomain.com

# 3. 自动续期
sudo systemctl status certbot.timer
```

---

### 第八步: COS 配置

#### 8.1 创建 COS 工具

```bash
npm install cos-nodejs-sdk-v5
```

创建 `src/utils/cos.ts`:
```typescript
import COS from 'cos-nodejs-sdk-v5'
import { config } from '../config'

export const cos = new COS({
  SecretId: config.cosSecretId,
  SecretKey: config.cosSecretKey,
})

export const uploadToCOS = async (filePath: string, key: string) => {
  return cos.putObject({
    Bucket: config.cosBucket,
    Region: config.cosRegion,
    Key: key,
    FilePath: filePath,
  })
}

export const getCOSUrl = (key: string) => {
  return `${config.cosDomain}/${key}`
}
```

#### 8.2 修改上传逻辑

在视频/图片上传接口中，将文件上传到 COS 而非本地:

```typescript
// 上传后返回 COS URL
const cosKey = `videos/${Date.now()}-${filename}`
await uploadToCOS(localPath, cosKey)
const url = getCOSUrl(cosKey)
```

---

## 📊 性能调优

### PM2 集群模式（已废弃）

```bash
# 使用所有 CPU 核心
# 当前生产拓扑不使用 PM2。请通过 Compose 管理 backend 副本和生命周期。

# 或指定核心数
```

### 数据库优化

```sql
-- 连接数优化
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '1GB';
ALTER SYSTEM SET effective_cache_size = '3GB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';

-- 常用索引
CREATE INDEX CONCURRENTLY idx_submission_status ON submissions(status);
CREATE INDEX CONCURRENTLY idx_assignment_deadline ON assignments(deadline);
```

### 系统优化

```bash
# 文件描述符限制
sudo nano /etc/security/limits.conf
# 添加:
* soft nofile 65535
* hard nofile 65535

# 内核参数优化
sudo nano /etc/sysctl.conf
# 添加:
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
```

---

## 🔍 监控与维护

### 日志查看

```bash
# 当前生产日志通过 Docker Compose 服务查看。
docker compose logs -f backend

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 系统日志
sudo tail -f /var/log/syslog
```

### 性能监控

```bash
# 监控服务和指标端点由仓库中的 Docker Compose 监控配置管理。
```

### 备份脚本

```bash
# 数据库备份请使用仓库中的加密备份入口；不要直接操作宿主机 PostgreSQL。
./scripts/monitoring/backup-enhanced.sh full
```

---

## 💰 费用优化建议

### 降低 COS 费用

1. **生命周期管理**: 30天后转低频存储
2. **CDN 预热**: 热门资源提前缓存
3. **压缩上传**: 图片压缩后再上传

### 降低服务器费用

1. **定时任务**: 非工作时间降低配置
2. **自动扩缩容**: 根据负载调整
3. **新用户优惠**: 利用首年折扣

---

## 🆘 常见问题

### Q1: 上传大文件失败？

```bash
# 修改 Nginx 配置
client_max_body_size 500M;

# 修改 Node.js
app.use(express.json({ limit: '500mb' }));
```

### Q2: 数据库连接过多？

```bash
# 查看连接数
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# 通过 Compose 重启 backend 服务以释放连接：
docker compose restart backend
```

### Q3: 内存不足？

```bash
# 查看内存使用
free -h
pm2 status

# 添加交换空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## ✅ 部署检查清单

- [ ] 服务器购买完成
- [ ] COS 存储桶创建
- [ ] 域名解析配置
- [ ] HTTPS 证书申请
- [ ] 环境变量配置
- [ ] 数据库迁移完成
- [ ] Docker Compose 服务启动正常
- [ ] Nginx 配置正确
- [ ] 文件上传测试通过
- [ ] 登录/注册测试通过
- [ ] 视频播放测试通过
- [ ] 监控告警配置 (可选)

---

**🎉 部署完成后，您的教学管理系统即可支持 100-300 人并发访问！**
