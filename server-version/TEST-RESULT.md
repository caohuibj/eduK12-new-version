# 本地测试报告

## 测试时间
2026-02-03

## 测试环境
- OS: macOS (Darwin ARM64)
- Node.js: v25.2.1
- PostgreSQL: 14.x
- Database: ptool (本地)

## 服务状态

### 后端服务
- URL: http://localhost:3001
- 状态: ✅ 运行中
- 进程: tsx watch src/index.ts

### 前端服务  
- URL: http://localhost:5173
- 状态: ✅ 运行中
- 进程: vite

### 数据库
- Host: localhost:5432
- Database: ptool
- 状态: ✅ 已连接
- 表数量: 10个表 (9业务表 + 1迁移表)

## API 功能测试

### 1. 认证模块 ✅
- 登录接口: 通过
- 用户名: admin
- 角色: ADMIN
- JWT Token: 正常生成

### 2. 课程管理 ✅
- 列表查询: 通过
- 数据结构: 正确

### 3. 教师码管理 ✅
- 生成教师码: 通过
- 权限控制: 通过

### 4. 数据库表 ✅
已创建的表:
- users (用户表)
- courses (课程表)
- course_students (课程学员关系表)
- assignments (作业表)
- submissions (作业提交表)
- checkins (打卡表)
- checkin_submissions (打卡提交表)
- videos (视频表)
- teacher_codes (教师码表)

## 访问地址

### 教师端/管理端
- 本地访问: http://localhost:5173
- 默认账号: admin / admin123

### API 接口
- Base URL: http://localhost:3001/api

## 结论
✅ 核心功能已验证通过，系统运行正常！
