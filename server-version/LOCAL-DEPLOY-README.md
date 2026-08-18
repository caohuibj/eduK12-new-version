# PTool 本地部署指南 (CLI 版本)

**适用场景**: 本地开发环境、快速测试  
**部署时间**: 5-10分钟  
**难度**: ⭐⭐ 简单

---

## 📋 前置要求

### 必需软件

| 软件 | 版本 | 用途 |
|-----|------|------|
| Node.js | 18+ | 运行后端/前端 |
| npm | 8+ | 包管理 |
| Git | 任意 | 代码管理 |

### 可选软件 (功能增强)

| 软件 | 用途 | 不安装的影响 |
|-----|------|-------------|
| PostgreSQL | 数据库 | 使用 SQLite |
| Redis | 队列缓存 | 视频处理不可用 |
| FFmpeg | 视频转码 | 视频处理不可用 |

---

## 🚀 快速开始

### 方式1: 使用一键脚本 (推荐)

```bash
# 1. 进入项目目录
cd /Users/Qiang/CodeBuddy/ptool/server-version

# 2. 运行部署脚本
bash scripts/deploy-local.sh

# 3. 启动服务
bash start-local.sh
```

### 方式2: 手动部署

#### 步骤1: 安装依赖

```bash
cd server-version

# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

#### 步骤2: 配置环境

```bash
cd backend

# 创建 .env 文件
cat > .env << EOF
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://ptool:ptool123@localhost:5432/ptool?schema=public
JWT_SECRET=local-test-secret
JWT_EXPIRES_IN=7d
UPLOAD_DIR=./uploads
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
EOF
```

#### 步骤3: 数据库设置

```bash
cd backend

# 使用 PostgreSQL (推荐)
npx prisma migrate deploy
npx prisma generate

# 或使用 SQLite (无需安装 PostgreSQL)
# 修改 .env: DATABASE_URL=file:./prisma/dev.db
# npx prisma db push
```

#### 步骤4: 构建和启动

```bash
# 构建后端
cd backend
npm run build

# 构建前端
cd ../frontend
npm run build

# 启动后端
cd ../backend
npm run dev

# 新终端 - 启动前端
cd frontend
npm run dev
```

---

## 🧪 运行测试

### 自动测试脚本

```bash
cd server-version

# 运行 CLI 测试
bash scripts/test-cli.sh

# 或指定 API 地址
API_URL=http://localhost:3001 bash scripts/test-cli.sh
```

### 手动测试

```bash
# 健康检查
curl http://localhost:3000/health

# 登录测试
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 获取课程列表 (需要 token)
curl http://localhost:3000/api/courses \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔧 常用命令

### 开发模式

```bash
# 后端开发模式 (热重载)
cd backend
npm run dev

# 前端开发模式
cd frontend
npm run dev
```

### 生产模式

```bash
# 构建
cd backend && npm run build
cd frontend && npm run build

# 启动
cd backend
npm start
```

### 数据库操作

```bash
cd backend

# 打开数据库管理界面
npx prisma studio

# 重置数据库
npx prisma migrate reset

# 查看数据库状态
npx prisma migrate status
```

### 日志查看

```bash
# 后端日志
cd backend
npm run dev 2>&1 | tee backend.log

# 前端日志
cd frontend
npm run dev 2>&1 | tee frontend.log
```

---

## 🆘 常见问题

### Q1: 端口被占用

```bash
# 查找占用端口的进程
lsof -i :3000
lsof -i :5173

# 杀死进程
kill -9 <PID>

# 或使用不同端口
# 修改 backend/.env: PORT=3001
# 修改 frontend/.env: VITE_API_URL=http://localhost:3001
```

### Q2: 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
pg_isready -h localhost -p 5432

# 启动 PostgreSQL (macOS)
brew services start postgresql

# 启动 PostgreSQL (Linux)
sudo systemctl start postgresql

# 或使用 SQLite (无需 PostgreSQL)
# 修改 .env: DATABASE_URL=file:./prisma/dev.db
```

### Q3: 依赖安装失败

```bash
# 清理缓存
npm cache clean --force

# 删除 node_modules 重新安装
rm -rf node_modules package-lock.json
npm install

# 使用国内镜像
npm config set registry https://registry.npmmirror.com
```

### Q4: 构建失败

```bash
# TypeScript 错误
cd backend
npx tsc --noEmit

# 查看详细错误
npm run build 2>&1
```

---

## 📁 项目结构

```
server-version/
├── backend/              # Node.js + Express + Prisma
│   ├── src/
│   │   ├── config/       # 配置
│   │   ├── controllers/  # API控制器
│   │   ├── workers/      # 视频处理Worker
│   │   └── utils/        # 工具函数
│   ├── prisma/
│   │   └── schema.prisma # 数据库模型
│   └── uploads/          # 上传文件
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   └── components/   # 通用组件
│   └── dist/             # 构建输出
└── scripts/              # 部署脚本
    ├── deploy-local.sh   # 本地部署
    ├── test-cli.sh       # CLI测试
    └── install-deps.sh   # 依赖安装
```

---

## 🎯 访问地址

| 服务 | URL | 说明 |
|-----|-----|------|
| 前端 | http://localhost:5173 | 用户界面 |
| 后端 API | http://localhost:3000 | REST API |
| 数据库管理 | http://localhost:5555 | Prisma Studio |
| 健康检查 | http://localhost:3000/health | 状态检查 |

---

## 🔐 默认账号

| 角色 | 用户名 | 密码 |
|-----|-------|------|
| 管理员 | admin | admin123 |

---

## 📚 相关文档

- `README.md` - 项目概述
- `DEPLOYMENT-CHECKLIST.md` - 部署清单
- `VIDEO-PROCESSING-DEPLOY.md` - 视频处理部署
- `PERFORMANCE_ANALYSIS_2C2G3M.md` - 性能分析

---

## ✅ 验证部署成功

1. 访问 http://localhost:5173 看到登录页面
2. 使用 admin/admin123 登录成功
3. 能创建课程、上传图片
4. 运行 `bash scripts/test-cli.sh` 全部通过

---

**部署时间**: _______________  
**部署人员**: _______________  
**问题记录**: _______________
