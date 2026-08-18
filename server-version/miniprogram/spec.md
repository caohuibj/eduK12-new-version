# 学生端小程序开发规范文档

## 1. 项目概述

### 1.1 项目背景

慧育空间（PTool）是一个在线教育管理平台，目前已稳定运行网页版本。本项目旨在开发微信小程序学生端，为学生提供更便捷的移动学习入口。

### 1.2 项目目标

- 为学生提供移动端学习入口
- 与现有网页版功能完全一致
- 复用现有后端 API，零后端改动
- 提供符合小程序规范的优质用户体验

### 1.3 项目范围

| 范围 | 说明 |
|------|------|
| **包含** | 学生端全部功能（登录、课程、作业、打卡、个人中心） |
| **不包含** | 教师端、管理端功能 |

---

## 2. 技术架构

### 2.1 技术选型

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **开发框架** | 微信原生小程序 | 性能最优，体验最佳 |
| **开发语言** | JavaScript (ES6+) | 原生支持 |
| **样式** | WXSS | 小程序原生样式 |
| **状态管理** | globalData + Storage | 轻量级方案 |
| **网络请求** | wx.request 封装 | 统一请求处理 |
| **后端 API** | 复用现有 Express API | 无需后端改动 |
| **认证方式** | JWT Token | 与网页版一致 |

### 2.2 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    微信小程序 (学生端)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Pages: 登录/注册/课程/作业/打卡/个人中心            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Utils: request / auth / storage / format           │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS + JWT Token
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   现有后端 (无需修改)                         │
│  Express + Prisma + PostgreSQL                              │
│  API: /api/auth/* /api/courses/* /api/assignments/* ...    │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 目录结构

```
miniprogram/
├── app.js                    # 小程序入口
├── app.json                  # 小程序配置
├── app.wxss                  # 全局样式
├── project.config.json       # 项目配置
├── sitemap.json              # 站点地图
│
├── pages/                    # 页面
│   ├── login/               # 登录页
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── register/            # 注册页
│   ├── index/               # 首页（课程列表）TabBar
│   ├── course/              # 课程详情
│   │   └── detail/
│   ├── assignment/          # 作业
│   │   ├── list/            # 作业列表 TabBar
│   │   └── submit/          # 作业提交
│   ├── checkin/             # 打卡
│   │   ├── list/            # 打卡列表 TabBar
│   │   └── submit/          # 打卡提交
│   ├── profile/             # 个人中心 TabBar
│   │   └── index/
│   ├── webview/             # WebView页面（B站视频）
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   └── password/            # 修改密码
│       ├── index.js
│       ├── index.json
│       ├── index.wxml
│       └── index.wxss
│
├── components/               # 公共组件
│   ├── course-card/         # 课程卡片
│   ├── assignment-card/     # 作业卡片
│   ├── checkin-card/        # 打卡卡片
│   ├── loading/             # 加载组件
│   ├── empty/               # 空状态组件
│   └── video-player/        # 视频播放器
│
├── utils/                    # 工具函数
│   ├── request.js           # 网络请求封装
│   ├── auth.js              # 认证工具
│   ├── storage.js           # 存储工具
│   ├── format.js            # 格式化工具
│   └── validate.js          # 验证工具
│
├── api/                      # API 接口
│   ├── auth.js              # 认证接口
│   ├── courses.js           # 课程接口
│   ├── assignments.js       # 作业接口
│   ├── checkins.js          # 打卡接口
│   └── uploads.js           # 上传接口
│
├── images/                   # 静态图片
│   ├── icons/               # 图标
│   └── common/              # 公共图片
│
└── styles/                   # 公共样式
    ├── variables.wxss       # 变量定义
    ├── common.wxss          # 公共样式
    └── components.wxss      # 组件样式
```

---

## 3. 页面功能规格

### 3.1 页面总览

| 页面 | 路径 | TabBar | 功能描述 |
|------|------|--------|---------|
| 登录 | pages/login/index | 否 | 用户名+密码登录 |
| 注册 | pages/register/index | 否 | 课程码注册 |
| 首页 | pages/index/index | 是 | 我的课程列表、加入课程 |
| 课程详情 | pages/course/detail | 否 | 课程信息、作业/打卡列表 |
| 作业列表 | pages/assignment/list | 是 | 所有作业列表 |
| 作业提交 | pages/assignment/submit | 否 | 选择题+文字作答 |
| 打卡列表 | pages/checkin/list | 是 | 所有打卡列表 |
| 打卡提交 | pages/checkin/submit | 否 | 文字+图片打卡 |
| 个人中心 | pages/profile/index | 是 | 个人信息、设置入口 |
| 修改密码 | pages/password/index | 否 | 修改登录密码 |
| WebView | pages/webview/index | 否 | B站视频播放页面 |

### 3.2 登录页 (pages/login/index)

#### 功能描述
学生通过用户名和密码登录系统。

#### 页面元素
```
┌─────────────────────────────────┐
│           慧育空间              │
│         学生学习平台             │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │ 用户名                  │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 密码                    │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │        登  录           │   │
│  └─────────────────────────┘   │
│                                 │
│  没有账号？去注册               │
│  使用课程码登录                 │
└─────────────────────────────────┘
```

#### 交互逻辑
1. 输入用户名和密码
2. 点击登录按钮
3. 调用 `/api/auth/login` 接口
4. 成功：存储 token，跳转首页
5. 失败：显示错误提示

#### API 接口
```javascript
POST /api/auth/login
Request:  { username: string, password: string }
Response: { code: 0, data: { token: string, user: UserInfo } }
```

### 3.3 注册页 (pages/register/index)

#### 功能描述
学生通过课程码注册账号并自动加入课程。

#### 页面元素
```
┌─────────────────────────────────┐
│           学生注册              │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │ 课程码                  │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 用户名                  │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 密码                    │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 确认密码                │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 真实姓名                │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │        注  册           │   │
│  └─────────────────────────┘   │
│                                 │
│  已有账号？去登录               │
└─────────────────────────────────┘
```

#### API 接口
```javascript
POST /api/auth/student-register
Request:  { courseCode: string, username: string, password: string, nickname: string }
Response: { code: 0, data: { token: string, user: UserInfo } }
```

### 3.4 首页 (pages/index/index)

#### 功能描述
展示学生已加入的课程列表，支持加入新课程。

#### 页面元素
```
┌─────────────────────────────────┐
│  我的课程              [+加入]  │
│  欢迎回来，张三                 │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │ 📚 Python入门           │   │
│  │ Python基础课程...       │   │
│  │ 👤 30人  📅 2026-02-01  │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 📚 数据结构             │   │
│  │ 数据结构与算法...       │   │
│  │ 👤 25人  📅 2026-02-15  │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  📚课程  📝作业  ✅打卡  👤我的  │
└─────────────────────────────────┘
```

#### 交互逻辑
1. 页面加载时获取课程列表
2. 点击课程卡片进入课程详情
3. 点击"加入课程"弹出输入框
4. 输入课程码调用加入接口

#### API 接口
```javascript
GET  /api/courses/my
Response: { code: 0, data: { list: Course[] } }

POST /api/courses/join
Request:  { courseCode: string }
Response: { code: 0, message: '加入成功' }
```

### 3.5 课程详情页 (pages/course/detail)

#### 功能描述
展示课程信息、作业列表、打卡列表。

#### 页面元素
```
┌─────────────────────────────────┐
│  ← 返回                         │
├─────────────────────────────────┤
│  📚 Python入门                  │
│  Python基础课程，适合初学者     │
│  👤 30名学员  课程号: ABC123    │
├─────────────────────────────────┤
│  [作业]  [打卡]                 │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │ 作业1：变量与数据类型    │   │
│  │ 截止: 2026-02-20  ✅已提交│   │
│  │                  [查看]  │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 作业2：条件语句          │   │
│  │ 截止: 2026-02-25  ⏰进行中│   │
│  │                  [去提交] │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

#### API 接口
```javascript
GET  /api/courses/:id
Response: { code: 0, data: Course }

GET  /api/courses/:id/assignments
Response: { code: 0, data: { list: Assignment[] } }

GET  /api/courses/:id/checkins
Response: { code: 0, data: { list: Checkin[] } }
```

### 3.6 作业列表页 (pages/assignment/list)

#### 功能描述
展示学生所有作业，包括待完成和已完成。

#### 页面元素
```
┌─────────────────────────────────┐
│  我的作业                       │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │ 作业1：变量与数据类型    │   │
│  │ Python入门              │   │
│  │ 截止: 2026-02-20        │   │
│  │                   ✅已提交│   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 作业2：条件语句          │   │
│  │ Python入门              │   │
│  │ 截止: 2026-02-25        │   │
│  │                   ⏰进行中│   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  📚课程  📝作业  ✅打卡  👤我的  │
└─────────────────────────────────┘
```

#### API 接口
```javascript
GET  /api/assignments/my
Response: { code: 0, data: { list: AssignmentWithSubmission[] } }
```

### 3.7 作业提交页 (pages/assignment/submit)

#### 功能描述
查看作业详情并提交答案。

#### 页面元素
```
┌─────────────────────────────────┐
│  ← 返回                         │
├─────────────────────────────────┤
│  作业1：变量与数据类型          │
│  请完成以下选择题和编程题...    │
│  截止: 2026-02-20 23:59        │
├─────────────────────────────────┤
│  1. Python中整数类型是？       │
│  ○ int                         │
│  ● float                       │
│  ○ str                         │
│  ○ bool                        │
├─────────────────────────────────┤
│  作答内容                       │
│  ┌─────────────────────────┐   │
│  │ 请输入你的答案...        │   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │      提交作业           │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

#### API 接口
```javascript
GET  /api/assignments/:id
Response: { code: 0, data: Assignment }

GET  /api/assignments/:id/my-submission
Response: { code: 0, data: Submission }

POST /api/assignments/:id/submit
Request:  { content: string, answers: object }
Response: { code: 0, message: '提交成功' }
```

### 3.8 打卡列表页 (pages/checkin/list)

#### 功能描述
展示学生所有打卡任务。

#### 页面元素
```
┌─────────────────────────────────┐
│  我的打卡                       │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │ 第1周学习打卡            │   │
│  │ Python入门              │   │
│  │ 截止: 2026-02-20        │   │
│  │                   ✅已打卡│   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 第2周学习打卡            │   │
│  │ Python入门              │   │
│  │ 截止: 2026-02-27        │   │
│  │                   ⏰进行中│   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  📚课程  📝作业  ✅打卡  👤我的  │
└─────────────────────────────────┘
```

#### API 接口
```javascript
GET  /api/checkins/my
Response: { code: 0, data: { list: CheckinWithSubmission[] } }
```

### 3.9 打卡提交页 (pages/checkin/submit)

#### 功能描述
提交打卡内容，支持文字和图片。

#### 页面元素
```
┌─────────────────────────────────┐
│  ← 返回                         │
├─────────────────────────────────┤
│  第1周学习打卡                  │
│  记录本周学习内容和心得...      │
│  截止: 2026-02-20 23:59        │
├─────────────────────────────────┤
│  打卡内容                       │
│  ┌─────────────────────────┐   │
│  │ 今天学习了Python变量...  │   │
│  │                         │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  上传图片                       │
│  ┌────┐ ┌────┐ ┌────┐ ┌──┐    │
│  │图片│ │图片│ │图片│ │ + │    │
│  └────┘ └────┘ └────┘ └──┘    │
│  最多上传9张图片                │
│                                 │
│  ┌─────────────────────────┐   │
│  │      提交打卡           │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

#### API 接口
```javascript
GET  /api/checkins/:id
Response: { code: 0, data: Checkin }

GET  /api/checkins/:id/my-submission
Response: { code: 0, data: CheckinSubmission }

POST /api/checkins/:id/submit
Request:  { content: string, images: string[] }
Response: { code: 0, message: '打卡成功' }
```

### 3.10 个人中心页 (pages/profile/index)

#### 功能描述
展示个人信息，提供设置入口。

#### 页面元素
```
┌─────────────────────────────────┐
│  个人中心                       │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │  👤 张三                │   │
│  │  zhangsan               │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  真实姓名                       │
│  ┌─────────────────────────┐   │
│  │ 张三                    │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │      保存修改           │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  ⚙️ 设置                        │
│  ┌─────────────────────────┐   │
│  │ 修改密码             >  │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │      退出登录           │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  📚课程  📝作业  ✅打卡  👤我的  │
└─────────────────────────────────┘
```

#### 交互逻辑
1. 页面加载时获取用户信息
2. 修改真实姓名后点击保存
3. 点击"修改密码"跳转密码修改页
4. 点击"退出登录"清除token返回登录页

#### API 接口
```javascript
GET  /api/users/me
Response: { code: 0, data: User }

PUT  /api/users/:id
Request:  { nickname: string }
Response: { code: 0, data: User }
```

### 3.11 修改密码页 (pages/password/index)

#### 功能描述
修改用户登录密码。

#### 页面元素
```
┌─────────────────────────────────┐
│  ← 返回                         │
├─────────────────────────────────┤
│  修改密码                       │
├─────────────────────────────────┤
│  原密码                         │
│  ┌─────────────────────────┐   │
│  │ ••••••                 │   │
│  └─────────────────────────┘   │
│  新密码                         │
│  ┌─────────────────────────┐   │
│  │ ••••••                 │   │
│  └─────────────────────────┘   │
│  确认新密码                     │
│  ┌─────────────────────────┐   │
│  │ ••••••                 │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │      确认修改           │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

#### 交互逻辑
1. 输入原密码、新密码、确认密码
2. 前端验证：密码长度≥6，两次密码一致
3. 调用修改密码接口
4. 成功后提示并返回个人中心

#### API 接口
```javascript
POST /api/users/change-password
Request:  { oldPassword: string, newPassword: string }
Response: { code: 0, message: '修改成功' }
```

### 3.12 WebView页 (pages/webview/index)

#### 功能描述
用于播放B站视频，通过 web-view 组件嵌入B站播放器。

#### 页面元素
```
┌─────────────────────────────────┐
│  ← 返回                         │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  │    B站视频播放器         │   │
│  │    (web-view嵌入)        │   │
│  │                         │   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

#### 交互逻辑
1. 接收参数：url（B站嵌入链接）、title（视频标题）
2. 使用 web-view 组件加载播放器
3. 用户可通过返回按钮退出

#### 页面实现
```javascript
// pages/webview/index.js
Page({
  data: {
    url: '',
    title: ''
  },
  
  onLoad(options) {
    const url = decodeURIComponent(options.url || '')
    const title = decodeURIComponent(options.title || '')
    wx.setNavigationBarTitle({ title: title || '视频播放' })
    this.setData({ url, title })
  }
})
```

```xml
<!-- pages/webview/index.wxml -->
<web-view src="{{url}}" bindmessage="onMessage" binderror="onError" />
```

#### 域名配置
需要在微信公众平台配置业务域名：`https://player.bilibili.com`

---

## 4. 数据模型定义

### 4.1 用户 (User)

```typescript
interface User {
  id: string
  username: string
  role: 'STUDENT' | 'TEACHER' | 'ADMIN'
  nickname: string
  avatarUrl?: string
  phone?: string
  expiresAt?: string
}
```

### 4.2 课程 (Course)

```typescript
interface Course {
  id: string
  title: string
  description?: string
  coverUrl?: string
  status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED'
  courseCode: string
  creatorId: string
  isRecruiting: boolean
  studentCount?: number
  createdAt: string
  endedAt?: string
}
```

### 4.3 作业 (Assignment)

```typescript
interface Assignment {
  id: string
  courseId: string
  title: string
  description?: string
  content?: string
  deadline?: string
  status: 'DRAFT' | 'PUBLISHED'
  questions?: Question[]
  videos?: Video[]
  images?: Image[]
  submitted?: boolean
  course?: Course
}

interface Question {
  question: string
  options: { key: string; text: string }[]
}

interface Video {
  id: string
  title: string
  url: string
  thumbnailUrl?: string
}

interface Image {
  id: string
  url: string
}
```

### 4.4 作业提交 (Submission)

```typescript
interface Submission {
  id: string
  assignmentId: string
  studentId: string
  content?: string
  answers?: Record<string, string>
  comment?: string
  status: 'DRAFT' | 'SUBMITTED' | 'GRADED'
  createdAt: string
  reviewedAt?: string
}
```

### 4.5 打卡 (Checkin)

```typescript
interface Checkin {
  id: string
  courseId: string
  title: string
  description?: string
  content?: string
  endTime?: string
  allowViewOthers: boolean
  videos?: Video[]
  images?: Image[]
  submitted?: boolean
}
```

### 4.6 打卡提交 (CheckinSubmission)

```typescript
interface CheckinSubmission {
  id: string
  checkinId: string
  studentId: string
  content?: string
  images?: string[]
  createdAt: string
}
```

---

## 5. API 接口规范

### 5.1 接口基础信息

| 项目 | 说明 |
|------|------|
| **Base URL** | `https://api.eduk12.top` |
| **认证方式** | Bearer Token (JWT) |
| **请求格式** | application/json |
| **响应格式** | application/json |

### 5.2 统一响应格式

```typescript
interface ApiResponse<T = any> {
  code: number      // 0 成功，非0 失败
  message: string   // 响应消息
  data: T          // 响应数据
}
```

### 5.3 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录 |
| POST | /api/auth/student-register | 学生注册 |
| GET | /api/auth/me | 获取当前用户 |

### 5.4 课程接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/courses/my | 获取我的课程 |
| GET | /api/courses/:id | 获取课程详情 |
| POST | /api/courses/join | 加入课程 |
| GET | /api/courses/:id/assignments | 获取课程作业 |
| GET | /api/courses/:id/checkins | 获取课程打卡 |

### 5.5 作业接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/assignments/my | 获取我的作业 |
| GET | /api/assignments/:id | 获取作业详情 |
| GET | /api/assignments/:id/my-submission | 获取我的提交 |
| POST | /api/assignments/:id/submit | 提交作业 |

### 5.6 打卡接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/checkins/my | 获取我的打卡 |
| GET | /api/checkins/:id | 获取打卡详情 |
| GET | /api/checkins/:id/my-submission | 获取我的提交 |
| POST | /api/checkins/:id/submit | 提交打卡 |

### 5.7 用户接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/users/me | 获取用户信息 |
| PUT | /api/users/:id | 更新用户信息 |
| POST | /api/users/change-password | 修改密码 |

### 5.8 上传接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/uploads/image | 上传图片 |

---

## 6. UI/UX 设计规范

### 6.1 主题色

| 颜色 | 色值 | 用途 |
|------|------|------|
| 主色 | #5bc0de | 按钮、链接、选中状态 |
| 成功 | #28a745 | 成功状态、已提交 |
| 警告 | #ffc107 | 警告状态 |
| 危险 | #dc3545 | 错误、截止 |
| 背景 | #f7f8fa | 页面背景 |
| 卡片 | #ffffff | 卡片背景 |
| 文字 | #333333 | 主要文字 |
| 次要文字 | #999999 | 次要文字 |

### 6.2 字体规范

| 类型 | 大小 | 粗细 |
|------|------|------|
| 大标题 | 36rpx | bold |
| 标题 | 32rpx | bold |
| 副标题 | 28rpx | medium |
| 正文 | 28rpx | normal |
| 辅助文字 | 24rpx | normal |
| 小字 | 22rpx | normal |

### 6.3 间距规范

| 类型 | 值 |
|------|------|
| 页面边距 | 32rpx |
| 卡片内边距 | 24rpx |
| 元素间距 | 24rpx |
| 小间距 | 16rpx |
| 最小间距 | 8rpx |

### 6.4 圆角规范

| 类型 | 值 |
|------|------|
| 大圆角 | 16rpx |
| 中圆角 | 12rpx |
| 小圆角 | 8rpx |
| 按钮 | 8rpx |
| 输入框 | 8rpx |
| 卡片 | 12rpx |

### 6.5 TabBar 规范

```json
{
  "tabBar": {
    "color": "#999999",
    "selectedColor": "#5bc0de",
    "backgroundColor": "#ffffff",
    "borderStyle": "black",
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "课程",
        "iconPath": "images/icons/course.png",
        "selectedIconPath": "images/icons/course-active.png"
      },
      {
        "pagePath": "pages/assignment/list/index",
        "text": "作业",
        "iconPath": "images/icons/assignment.png",
        "selectedIconPath": "images/icons/assignment-active.png"
      },
      {
        "pagePath": "pages/checkin/list/index",
        "text": "打卡",
        "iconPath": "images/icons/checkin.png",
        "selectedIconPath": "images/icons/checkin-active.png"
      },
      {
        "pagePath": "pages/profile/index/index",
        "text": "我的",
        "iconPath": "images/icons/profile.png",
        "selectedIconPath": "images/icons/profile-active.png"
      }
    ]
  }
}
```

**路径说明**：
- `pages/index/index` - 首页，目录为 `pages/index/`，文件为 `index.*`
- `pages/assignment/list/index` - 作业列表，目录为 `pages/assignment/list/`，文件为 `index.*`
- `pages/checkin/list/index` - 打卡列表，目录为 `pages/checkin/list/`，文件为 `index.*`
- `pages/profile/index/index` - 个人中心，目录为 `pages/profile/index/`，文件为 `index.*`

---

## 7. 安全与性能要求

### 7.1 安全要求

| 要求 | 说明 |
|------|------|
| HTTPS | 所有请求必须使用 HTTPS |
| Token 存储 | 使用 wx.setStorageSync 安全存储 |
| 敏感信息 | 不在代码中硬编码敏感信息 |
| 输入验证 | 前端验证 + 后端验证 |
| XSS 防护 | 使用 text 组件显示用户内容 |

### 7.2 性能要求

| 指标 | 要求 |
|------|------|
| 首屏加载 | < 2s |
| 页面切换 | < 300ms |
| 接口响应 | < 1s |
| 图片压缩 | 上传前压缩至 500KB 以下 |
| 分包加载 | 主包 < 2MB |

### 7.3 兼容性要求

| 要求 | 说明 |
|------|------|
| 微信版本 | 支持 7.0.0 及以上 |
| 基础库 | 支持 2.10.0 及以上 |
| 屏幕适配 | 支持 375px - 414px 宽度 |

### 7.4 交互增强规范

#### 图片预览

使用微信原生 `wx.previewImage` 实现图片预览功能：

```javascript
// 点击图片预览
onImageTap(e) {
  const current = e.currentTarget.dataset.src
  const urls = this.data.images
  
  wx.previewImage({
    current: current,
    urls: urls
  })
}
```

```xml
<!-- 图片列表 -->
<view class="image-list">
  <image 
    wx:for="{{images}}" 
    wx:key="index"
    src="{{item}}" 
    mode="aspectFill"
    data-src="{{item}}"
    bindtap="onImageTap"
  />
</view>
```

**应用场景**：
- 打卡提交页：预览已上传图片
- 打卡详情页：预览打卡图片
- 课程详情页：预览课程图片

#### 下拉刷新

在页面配置中启用下拉刷新：

```json
// pages/xxx/index.json
{
  "enablePullDownRefresh": true,
  "backgroundTextStyle": "dark"
}
```

```javascript
// pages/xxx/index.js
Page({
  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
```

**启用页面**：
- 首页（课程列表）
- 作业列表
- 打卡列表
- 课程详情

#### 错误处理

统一错误处理机制：

```javascript
// utils/error.js
export function handleError(error, context = '') {
  console.error(`[${context}]`, error)
  
  let message = '操作失败，请稍后重试'
  
  if (error.errMsg) {
    if (error.errMsg.includes('timeout')) {
      message = '网络超时，请检查网络连接'
    } else if (error.errMsg.includes('fail')) {
      message = '网络请求失败'
    }
  }
  
  if (error.code) {
    switch (error.code) {
      case 401:
        message = '登录已过期，请重新登录'
        wx.reLaunch({ url: '/pages/login/index' })
        break
      case 403:
        message = '没有权限执行此操作'
        break
      case 404:
        message = '请求的资源不存在'
        break
      case 500:
        message = '服务器错误，请稍后重试'
        break
    }
  }
  
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2000
  })
  
  return message
}
```

**错误类型处理**：

| 错误类型 | 处理方式 |
|---------|---------|
| 网络错误 | 提示检查网络 |
| 401 未授权 | 清除token，跳转登录 |
| 403 禁止访问 | 提示无权限 |
| 404 未找到 | 提示资源不存在 |
| 500 服务器错误 | 提示稍后重试 |
| 业务错误 | 显示后端返回的错误信息 |

#### 加载状态

统一加载状态组件和规范：

```javascript
// components/loading/index.js
Component({
  properties: {
    loading: {
      type: Boolean,
      value: false
    },
    text: {
      type: String,
      value: '加载中...'
    },
    type: {
      type: String,
      value: 'spinner' // spinner | skeleton
    }
  }
})
```

```xml
<!-- components/loading/index.wxml -->
<view class="loading-container" wx:if="{{loading}}">
  <view class="loading-spinner" wx:if="{{type === 'spinner'}}">
    <view class="spinner"></view>
    <text>{{text}}</text>
  </view>
  <view class="loading-skeleton" wx:else>
    <view class="skeleton-item" wx:for="{{3}}" wx:key="index"></view>
  </view>
</view>
```

**加载状态规范**：

| 场景 | 加载方式 | 说明 |
|------|---------|------|
| 页面首次加载 | 骨架屏 | 提升用户体验 |
| 列表加载更多 | 底部loading | 配合上拉触底 |
| 提交操作 | 按钮loading | 按钮显示loading状态 |
| 下拉刷新 | 原生刷新 | 系统样式 |

**页面加载示例**：

```javascript
Page({
  data: {
    loading: true,
    list: []
  },
  
  onLoad() {
    this.loadData()
  },
  
  async loadData() {
    this.setData({ loading: true })
    
    try {
      const res = await api.getList()
      this.setData({ list: res.data })
    } catch (error) {
      handleError(error, 'loadData')
    } finally {
      this.setData({ loading: false })
    }
  }
})
```

---

## 9. 视频播放方案

### 9.1 COS 存储视频播放

小程序使用原生 `<video>` 组件播放 COS 视频：

```xml
<video 
  src="https://ptool-videos-edu-xxx.file.myqcloud.com/videos/processed/xxx.mp4"
  controls
  show-center-play-btn
  enable-progress-gesture
  title="{{videoTitle}}"
  poster="{{thumbnailUrl}}"
/>
```

**域名配置**：
- downloadFile 合法域名：`https://ptool-videos-edu-1393949445.file.myqcloud.com`

### 9.2 B站视频播放

由于小程序不支持 iframe，B站视频采用以下方案：

#### 方案 A：web-view 嵌入（推荐）

```javascript
// 跳转到 web-view 页面播放
handleBilibiliVideo(url, title) {
  const bvMatch = url.match(/BV[a-zA-Z0-9]+/)
  if (bvMatch) {
    const embedUrl = `https://player.bilibili.com/player.html?bvid=${bvMatch[0]}&page=1&high_quality=1&danmaku=0`
    wx.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(embedUrl)}&title=${encodeURIComponent(title)}`
    })
  }
}
```

```xml
<!-- pages/webview/index.wxml -->
<web-view src="{{url}}" />
```

#### 方案 B：提示用户跳转

```javascript
// 复制链接提示用户在浏览器打开
wx.setClipboardData({
  data: bilibiliUrl,
  success: () => {
    wx.showToast({
      title: '链接已复制，请在浏览器打开',
      icon: 'none'
    })
  }
})
```

**域名配置**：
- 业务域名：`https://player.bilibili.com`

### 9.3 YouTube 视频处理

由于国内网络限制，小程序**不支持播放YouTube视频**。处理方案：

```javascript
// YouTube视频处理 - 提示不支持
handleYouTubeVideo(title) {
  wx.showModal({
    title: '暂不支持',
    content: `「${title}」为YouTube视频，小程序暂不支持播放，请在网页端查看。`,
    showCancel: false,
    confirmText: '我知道了'
  })
}
```

**建议**：如需在小程序播放，建议将YouTube视频迁移至：
1. **腾讯视频** - 微信生态原生支持，体验最佳
2. **COS存储** - 完全可控，无第三方依赖

### 9.4 视频播放组件

```javascript
// components/video-player/index.js
Component({
  properties: {
    src: String,
    title: String,
    poster: String,
    type: {
      type: String,
      value: 'cos' // cos | bilibili | youtube
    }
  },
  
  methods: {
    onPlay() {
      const type = this.properties.type
      if (type === 'bilibili') {
        this.handleBilibiliPlay()
      } else if (type === 'youtube') {
        this.handleYouTubePlay()
      } else {
        this.triggerEvent('play')
      }
    },
    
    handleBilibiliPlay() {
      const url = this.properties.src
      const bvMatch = url.match(/BV[a-zA-Z0-9]+/)
      if (bvMatch) {
        const embedUrl = `https://player.bilibili.com/player.html?bvid=${bvMatch[0]}&page=1&high_quality=1&danmaku=0`
        wx.navigateTo({
          url: `/pages/webview/index?url=${encodeURIComponent(embedUrl)}&title=${encodeURIComponent(this.properties.title)}`
        })
      }
    },
    
    handleYouTubePlay() {
      wx.showModal({
        title: '暂不支持',
        content: `「${this.properties.title}」为YouTube视频，小程序暂不支持播放，请在网页端查看。`,
        showCancel: false,
        confirmText: '我知道了'
      })
    },
    
    onError(e) {
      console.error('视频播放错误:', e.detail)
      wx.showToast({
        title: '视频加载失败',
        icon: 'none'
      })
    }
  }
})
```

### 9.5 视频类型判断

```javascript
// utils/video.js
export function getVideoType(url) {
  if (!url) return 'unknown'
  if (url.includes('bilibili.com') || url.includes('b23.tv')) {
    return 'bilibili'
  }
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube'
  }
  if (url.includes('myqcloud.com')) {
    return 'cos'
  }
  return 'local'
}

export function isPlayableInMiniProgram(url) {
  const type = getVideoType(url)
  return type === 'cos' || type === 'bilibili' || type === 'local'
}
```

---

## 10. 与网页版差异说明

### 10.1 导航方式

| 网页版 | 小程序版 |
|--------|---------|
| 顶部横向导航 | 底部 TabBar 导航 |
| 文字链接返回 | 小程序原生返回按钮 |

### 10.2 交互方式

| 功能 | 网页版 | 小程序版 |
|------|--------|---------|
| 图片上传 | `<input type="file">` | `wx.chooseImage` |
| 视频播放 | 自定义播放器 | `video` 组件 |
| 模态框 | 自定义弹窗 | `wx.showModal` |
| 提示 | `alert()` | `wx.showToast` |
| 下拉刷新 | 无 | 原生支持 |

### 10.3 功能一致性

所有业务功能与网页版完全一致，仅交互方式适配小程序规范。

---

## 11. 开发环境要求

### 11.1 开发工具

- 微信开发者工具 (最新稳定版)
- VS Code (可选)

### 11.2 配置要求

```json
// project.config.json
{
  "appid": "your-appid",
  "projectname": "ptool-miniprogram",
  "setting": {
    "urlCheck": true,
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true
  }
}
```

### 11.3 服务器域名配置

在微信公众平台配置以下域名：

| 域名类型 | 域名 | 用途 |
|---------|------|------|
| request 合法域名 | `https://api.eduk12.top` | API 请求 |
| uploadFile 合法域名 | `https://api.eduk12.top` | 文件上传 |
| downloadFile 合法域名 | `https://ptool-videos-edu-1393949445.file.myqcloud.com` | 视频下载 |
| downloadFile 合法域名 | `https://api.eduk12.top` | 图片下载 |
| 业务域名 | `https://player.bilibili.com` | B站视频（可选） |

---

## 12. 版本规划

### 12.1 v1.0.0 (首版)

- 登录/注册
- 课程列表/详情
- 作业列表/提交
- 打卡列表/提交
- 个人中心

### 12.2 后续版本

- v1.1.0: 视频播放优化
- v1.2.0: 消息通知
- v1.3.0: 学习统计

---

## 12. 上线部署方案

### 12.1 架构隔离

小程序作为独立项目，完全不影响现有系统：

```
┌─────────────────────────────────────────────────────────────┐
│                      现有系统（不受影响）                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  网页前端    │  │  后端 API   │  │  数据库     │        │
│  │  (React)    │  │  (Express)  │  │ (PostgreSQL)│        │
│  └─────────────┘  └──────┬──────┘  └─────────────┘        │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           │ 复用 API（只读）
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 小程序（独立项目）                     │   │
│  │  • 独立代码仓库                                      │   │
│  │  • 独立部署流程                                      │   │
│  │  • 只调用现有 API                                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 上线流程

| 阶段 | 时间 | 说明 |
|------|------|------|
| 开发 | 5-6 天 | 完成所有功能开发 |
| 测试 | 1 天 | 真机测试、兼容性测试 |
| 提交审核 | 1 天 | 上传代码、填写资料 |
| 审核等待 | 1-3 天 | 微信官方审核 |
| 发布上线 | 即时 | 审核通过后即可发布 |

### 13.3 关键保障措施

| 措施 | 说明 |
|------|------|
| **后端零改动** | 小程序只调用现有 API，无需修改后端 |
| **独立项目** | 小程序代码完全独立，不影响网页版 |
| **测试环境** | 开发阶段可使用测试账号验证 |
| **灰度发布** | 可先小范围测试再全量发布 |
| **回滚机制** | 小程序支持版本回滚 |
