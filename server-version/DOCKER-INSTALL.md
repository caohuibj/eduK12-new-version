# macOS Docker 安装指南

## 方式一：Homebrew 安装（推荐）

```bash
# 安装 Docker Desktop
brew install --cask docker

# 启动 Docker Desktop
open /Applications/Docker.app
```

## 方式二：官网下载

1. 访问 https://www.docker.com/products/docker-desktop
2. 下载 Docker Desktop for Mac (Apple Silicon)
3. 双击安装包，拖拽到 Applications
4. 打开 Docker.app

## 验证安装

```bash
# 等待 Docker 启动完成后执行
docker --version
docker-compose --version

# 应该输出类似：
# Docker version 24.0.7, build afdd53b
# Docker Compose version v2.23.0
```

## 启动项目

```bash
cd /Users/Qiang/CodeBuddy/ptool/server-version

# 1. 创建环境变量文件
cp .env.example .env

# 2. 编辑 .env：填写 DB_*、完整且已 percent-encode 的 DATABASE_URL、JWT/加密密钥、CORS 和管理员凭据

# 3. 执行迁移和幂等 seed
docker compose --profile ops run --rm migrate
docker compose --profile ops run --rm seed

# 4. 启动应用服务
docker compose up -d backend worker frontend

# 5. 查看日志
docker compose logs -f

# 看到 "Server running on port 3000" 表示启动成功
```

## 访问应用

- **前端页面**: http://localhost
- **后端 API**: http://localhost/api
- **管理员账号**: 使用 `.env` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`

## 常用命令

```bash
# 查看运行状态
docker-compose ps

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看后端日志
docker-compose logs backend

# 查看数据库日志
docker-compose logs postgres

# 进入数据库
docker-compose exec postgres psql -U ptool -d ptool

# 备份数据库
docker-compose exec postgres pg_dump -U ptool ptool > backup.sql
```

## 故障排除

### 1. 端口被占用
```bash
# 检查端口占用
lsof -i :80
lsof -i :3000
lsof -i :5432

# 杀掉占用进程
kill -9 <PID>
```

### 2. 权限问题
```bash
# 重置 Docker 权限
docker-compose down
sudo chown -R $USER:$USER .
docker-compose up -d
```

### 3. 数据库连接失败
```bash
# 删除旧数据重新初始化
docker-compose down -v  # 删除 volumes
docker-compose up -d
```
