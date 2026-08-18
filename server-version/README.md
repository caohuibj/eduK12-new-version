# PTool 独立服务器版本

完全独立的教学管理系统，不依赖微信小程序和 CloudBase，使用自建服务器和数据库。

## 功能特性

- **用户认证**：用户名/密码登录，支持教师、学生、管理员三种角色
- **课程管理**：创建、编辑、删除课程，删除权限控制
- **作业系统**：创建作业（支持选择题、视频），作业批改，数据导出
- **打卡系统**：创建打卡，图片上传，打卡交流
- **视频库**：视频上传、管理、复用到作业
- **权限管理**：教师码管理，角色权限控制

## 技术栈

- **后端**：Node.js + Express + TypeScript + Prisma
- **数据库**：PostgreSQL
- **前端**：React + TypeScript + Vite
- **部署**：Docker + Docker Compose

## 快速开始

### 环境要求

- Docker 20.10+
- Docker Compose 2.0+

### 启动服务

```bash
# 1. 进入项目目录
cd server-version

# 2. 复制环境变量文件
cp .env.example .env

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f
```

### 访问应用

- 管理端：http://localhost
- 默认管理员账号：`admin` / `admin123`

### 停止服务

```bash
docker-compose down
```

### 数据持久化

- 数据库数据：`postgres_data` Docker Volume
- 上传文件：`./uploads` 目录

## 开发指南

### 后端开发

```bash
cd backend
npm install
npm run dev
```

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

## 数据库迁移

```bash
# 进入后端容器
docker-compose exec backend sh

# 创建迁移
npx prisma migrate dev --name migration_name

# 部署迁移
npx prisma migrate deploy

# 生成客户端
npx prisma generate
```

## 目录结构

```
server-version/
├── docker-compose.yml      # Docker 编排配置
├── .env.example            # 环境变量示例
├── README.md               # 项目说明
├── backend/                # 后端服务
│   ├── src/
│   ├── prisma/
│   └── Dockerfile
├── frontend/               # 前端应用
│   ├── src/
│   └── Dockerfile
├── nginx/                  # Nginx 配置
│   └── nginx.conf
└── uploads/                # 上传文件存储
    ├── videos/
    ├── images/
    └── covers/
```

## 与 CloudBase 版本的区别

| 特性 | CloudBase 版本 | 独立服务器版本 |
|------|---------------|---------------|
| 用户认证 | 微信登录 | 用户名/密码 |
| 数据库 | CloudBase NoSQL | PostgreSQL |
| 文件存储 | CloudBase 存储 | 本地存储 |
| 部署 | 腾讯云 | Docker 自托管 |
| 小程序 | 支持 | 不支持 |

## 许可证

MIT
