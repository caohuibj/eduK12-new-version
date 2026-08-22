# 学生端使用指南

## 双入口设计

系统现在提供两个独立的入口：

### 1. 门户
- **URL**: http://localhost:5173/
- 学生、教师、管理员从门户选择身份入口，不要再访问 `/login`（该路径已废弃）。

### 2. 教师入口
- **登录**: http://localhost:5173/teacher/account-login
- **注册**: http://localhost:5173/teacher/login （验证教师码后进入 `/teacher/register`，提交后需管理员审核通过才能登录）

### 3. 管理员入口
- **登录**: http://localhost:5173/admin/login
- 账号密码来自环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（未设置时默认为 `admin` / `admin123`）

### 4. 学生入口
- **已有账号**: http://localhost:5173/student/login
- **新学生**: http://localhost:5173/student/course-login （课程码 → `/student/register`）

---

## 学生端功能

### 登录/注册
- 新学生用课程码进入注册页，创建账号后加入该课
- 已有账号从课程码页或注册页进入 `/student/login`

### 我的课程
- 查看已加入的课程列表
- 点击"加入课程"按钮，输入课程号加入新课程

### 课程详情
- 查看课程信息和教师
- 查看作业列表
- 查看打卡列表
- 点击作业/打卡进行提交

### 作业提交
- 查看作业详情和要求
- 选择题自动评分
- 提交文字答案
- 查看教师评语

### 打卡
- 查看所有打卡任务
- 提交打卡内容（支持文字和图片）
- 查看打卡状态（进行中/已打卡/已截止）

---

## 测试账号

### 管理员账号
- 用户名/密码以 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 为准（未设置时为 `admin` / `admin123`）
- 角色: ADMIN

### 测试学生账号
- 用户名: student01
- 密码: 123456
- 角色: STUDENT

---

## 使用流程

### 教师端创建课程
1. 登录教师端: http://localhost:5173/teacher/account-login
2. 创建课程，获取课程号（如 ABC123）
3. 发布作业和打卡

### 学生端加入学习
1. 新学生打开 http://localhost:5173/student/course-login ，输入课程码注册；已有账号打开 `/student/login`
2. 进入「我的课程」，也可再加入其他课程
3. 查看作业和打卡，提交完成。作业截止后、打卡结束后不能再交。

---

## 页面列表

| 页面 | 路径 | 说明 |
|------|------|------|
| 门户 | / | 三角色入口 |
| 学生课程码 | /student/course-login | 新学生加入课程 |
| 学生登录 | /student/login | 已有账号登录 |
| 学生注册 | /student/register | 课程码验证后的注册页 |
| 我的课程 | /student | 学生主页，展示已加入的课程 |
| 课程详情 | /student/courses/:id | 查看课程作业和打卡 |
| 作业提交 | /student/assignments/:id | 提交作业页面 |
| 我的打卡 | /student/checkins | 查看所有打卡任务 |
| 打卡提交 | /student/checkins/:id | 提交打卡页面 |
