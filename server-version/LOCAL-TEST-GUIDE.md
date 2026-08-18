# 本地测试指南

## 1. 入口说明

### 教师端/管理端入口
- **URL**: http://localhost (部署后)
- **功能**: 课程管理、作业管理、打卡管理、视频库、用户管理、教师码管理
- **登录方式**: 用户名/密码

### 学生端说明
当前版本主要面向教师和管理员。学生功能通过以下方式实现：
- 学生可以注册账号（无需教师码）
- 学生可以通过课程号加入课程
- 学生可以提交作业和打卡

**注意**: 当前前端页面主要面向教师/管理员，学生功能需要通过 API 测试或后续扩展学生端页面。

## 2. 本地数据库状态

### 当前状态
- **数据库**: 未安装（需要 Docker 或本地 PostgreSQL）
- **测试状态**: 未测试（需要启动服务后才能测试）

### 启动后自动创建
启动 Docker 后会自动：
1. 创建 PostgreSQL 数据库
2. 运行 Prisma 迁移（创建9个表）
3. 插入默认管理员账号

## 3. 本地测试步骤

### 方式一：Docker 部署（推荐）

```bash
# 1. 安装 Docker Desktop
# Mac: https://docs.docker.com/desktop/install/mac-install/
# Windows: https://docs.docker.com/desktop/install/windows-install/

# 2. 进入项目目录
cd /Users/Qiang/CodeBuddy/ptool/server-version

# 3. 创建环境变量文件
cp .env.example .env

# 4. 启动服务
docker-compose up -d

# 5. 查看日志
docker-compose logs -f

# 6. 访问应用
# 前端: http://localhost
# API: http://localhost/api
```

### 方式二：本地开发模式

```bash
# 1. 安装 PostgreSQL（如果未安装）
# Mac: brew install postgresql
# 或下载: https://www.postgresql.org/download/

# 2. 创建数据库
createdb ptool

# 3. 启动后端
cd backend
npm install
npm run dev

# 4. 启动前端（新终端）
cd frontend
npm install
npm run dev

# 5. 访问
# 前端: http://localhost:5173
# API: http://localhost:3000/api
```

## 4. 测试账号

### 默认管理员
- 用户名: `admin`
- 密码: `admin123`

### 注册教师账号
1. 先生成教师码（管理员登录后）
2. 注册时填写教师码

### 注册学生账号
- 直接注册，无需教师码

## 5. 功能验证清单

- [ ] 管理员登录
- [ ] 创建课程
- [ ] 生成教师码
- [ ] 注册教师账号
- [ ] 教师创建作业
- [ ] 学生加入课程
- [ ] 学生提交作业
- [ ] 教师批改作业
- [ ] 创建打卡
- [ ] 上传视频
- [ ] 导出作业数据
