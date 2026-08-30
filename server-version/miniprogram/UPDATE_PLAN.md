# 小程序端学生功能更新方案

> 发布门禁说明（2026-08-30）：课堂互动功能暂不属于本次生产发布范围。现有课堂页面依赖缺失的 API 模块且使用旧 WebSocket 协议；`app.json` 已不再暴露这些页面。重新启用前必须完成正式 API/Socket.IO 改造及真机端到端验证。

## 📋 更新概览

基于网页版学生端的最新功能，同步更新小程序端。

---

## 🆕 新增功能

### 1. 课堂互动答题功能（最重要）

**网页版文件**：
- `ClassroomJoin.tsx` - 课堂加入页面
- `ClassroomAnswer.tsx` - 课堂答题页面
- `ClassroomEnter.tsx` - 课堂码输入页面

**小程序端新增页面**：
- `pages/classroom/join/join` - 课堂加入页
- `pages/classroom/answer/answer` - 课堂答题页

**功能特性**：
- ✅ 扫码加入课堂
- ✅ 课堂码输入加入
- ✅ 实时答题（单选、多选、判断）
- ✅ 答题倒计时
- ✅ 支持临时学生模式（无需登录）
- ✅ Socket实时通信

---

### 2. 量表测评功能

**网页版文件**：
- `StudentScales.tsx` - 量表列表
- `ScaleAssessment.tsx` - 量表测评
- `ScaleResult.tsx` - 量表结果

**小程序端新增页面**：
- `pages/scale/list/list` - 量表列表
- `pages/scale/assessment/assessment` - 量表测评
- `pages/scale/result/result` - 量表结果

**功能特性**：
- ✅ 量表列表展示
- ✅ 量表答题
- ✅ 答题时间记录
- ✅ 结果查看

---

## 🔄 更新功能

### 3. 主页更新

**新增**：
- 课堂码输入入口
- 快速加入课堂功能

### 4. 作业提交页面更新

**新增功能**：
- 标签编辑功能
- 数据导出功能

### 5. 打卡提交页面更新

**新增功能**：
- 标签编辑功能
- 数据导出功能

### 6. 问卷测评页面更新

**新增功能**：
- 表单题目支持
- 作答时间记录
- 数据导出功能

### 7. 量表测评页面更新

**新增功能**：
- 作答时间记录
- 数据导出功能

---

## 📁 文件结构

### 新增文件

```
miniprogram/
├── pages/
│   ├── classroom/
│   │   ├── join/
│   │   │   ├── join.js
│   │   │   ├── join.json
│   │   │   ├── join.wxml
│   │   │   └── join.wxss
│   │   └── answer/
│   │       ├── answer.js
│   │       ├── answer.json
│   │       ├── answer.wxml
│   │       └── answer.wxss
│   └── scale/
│       ├── list/
│       │   ├── list.js
│       │   ├── list.json
│       │   ├── list.wxml
│       │   └── list.wxss
│       ├── assessment/
│       │   ├── assessment.js
│       │   ├── assessment.json
│       │   ├── assessment.wxml
│       │   └── assessment.wxss
│       └── result/
│           ├── result.js
│           ├── result.json
│           ├── result.wxml
│           └── result.wxss
└── utils/
    └── classroom-socket.js  # Socket通信封装
```

### 修改文件

```
miniprogram/
├── app.json  # 新增页面路由
├── pages/
│   ├── index/
│   │   └── index.js  # 添加课堂码入口
│   ├── assignment/
│   │   └── submit/
│   │       └── submit.js  # 添加标签编辑
│   ├── checkin/
│   │   └── submit/
│   │       └── submit.js  # 添加标签编辑
│   └── questionnaire/
│       └── assessment/
│           └── assessment.js  # 添加表单题目、作答时间
```

---

## 🔧 关键技术点

### 1. Socket通信适配

**网页版**：使用 `socket.io-client`

**小程序端**：使用微信小程序 `wx.connectSocket`

**封装示例**：
```javascript
// utils/classroom-socket.js
class ClassroomSocket {
  constructor(classroomId, role, studentId) {
    this.classroomId = classroomId
    this.role = role
    this.studentId = studentId
    this.socket = null
    this.listeners = {}
  }

  connect() {
    const url = `wss://your-domain.com/classroom?classroomId=${this.classroomId}&role=${this.role}&studentId=${this.studentId}`
    
    this.socket = wx.connectSocket({
      url: url,
      success: () => {
        console.log('Socket连接成功')
      }
    })

    wx.onSocketOpen(() => {
      console.log('Socket已打开')
      this.trigger('connected')
    })

    wx.onSocketMessage((res) => {
      const data = JSON.parse(res.data)
      this.trigger(data.event, data.payload)
    })

    wx.onSocketClose(() => {
      console.log('Socket已关闭')
      this.trigger('disconnected')
    })

    wx.onSocketError((err) => {
      console.error('Socket错误', err)
      this.trigger('error', err)
    })
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  emit(event, data) {
    const message = JSON.stringify({ event, data })
    wx.sendSocketMessage({
      data: message
    })
  }

  trigger(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data))
    }
  }

  close() {
    if (this.socket) {
      wx.closeSocket()
    }
  }
}

module.exports = ClassroomSocket
```

### 2. 答题倒计时

```javascript
// pages/classroom/answer/answer.js
Page({
  data: {
    countdown: 0,
    question: null,
    answer: null,
    multiAnswers: [],
    submitted: false
  },

  startCountdown(seconds) {
    this.setData({ countdown: seconds })
    
    this.timer = setInterval(() => {
      const countdown = this.data.countdown - 1
      if (countdown <= 0) {
        clearInterval(this.timer)
        this.autoSubmit()
      } else {
        this.setData({ countdown })
      }
    }, 1000)
  },

  autoSubmit() {
    if (!this.data.submitted) {
      this.submitAnswer()
    }
  }
})
```

### 3. 多选题支持

```javascript
// pages/classroom/answer/answer.js
handleMultiSelect(e) {
  const option = e.currentTarget.dataset.option
  let multiAnswers = this.data.multiAnswers
  
  const index = multiAnswers.indexOf(option)
  if (index > -1) {
    multiAnswers.splice(index, 1) // 取消选择
  } else {
    multiAnswers.push(option) // 添加选择
  }
  
  this.setData({ multiAnswers })
}
```

---

## 📝 更新步骤

### 第1步：创建课堂页面（已完成）
✅ 创建 `pages/classroom/join/` 目录
✅ 创建 `pages/classroom/answer/` 目录

### 第2步：实现课堂加入页面
- 创建 `join.js, join.wxml, join.wxss, join.json`
- 实现课堂码验证
- 实现课堂信息展示

### 第3步：实现课堂答题页面
- 创建 `answer.js, answer.wxml, answer.wxss, answer.json`
- 实现Socket连接
- 实现实时答题
- 实现倒计时
- 实现多选题

### 第4步：创建量表页面
- 创建 `pages/scale/` 相关页面
- 实现量表列表、测评、结果

### 第5步：更新现有页面
- 更新主页（添加课堂码入口）
- 更新作业提交（标签编辑）
- 更新打卡提交（标签编辑）
- 更新问卷测评（表单题目、作答时间）

### 第6步：更新配置文件
- 更新 `app.json` 添加新页面路由

### 第7步：测试
- 测试课堂功能
- 测试量表功能
- 测试Socket通信
- 测试答题流程

---

## 🎯 注意事项

### 1. Socket域名配置
需要在微信小程序后台配置合法域名：
```
wss://your-domain.com
```

### 2. 临时学生模式
小程序端需要支持未登录用户参与课堂：
- 使用设备唯一ID作为临时学生ID
- 或生成随机UUID

### 3. 性能优化
- 答题页面使用 `setData` 优化
- Socket消息节流
- 页面卸载时关闭Socket

### 4. 错误处理
- Socket断线重连
- 网络异常处理
- 答题超时处理

---

## 📊 预期效果

更新后，小程序端将具备与网页版学生端相同的功能：

| 功能 | 网页版 | 小程序版（更新后） |
|------|--------|-------------------|
| 课堂互动答题 | ✅ | ✅ |
| 量表测评 | ✅ | ✅ |
| 作业提交 | ✅ | ✅ |
| 打卡提交 | ✅ | ✅ |
| 问卷测评 | ✅ | ✅ |
| 标签编辑 | ✅ | ✅ |
| 作答时间记录 | ✅ | ✅ |
| 数据导出 | ✅ | ✅ |

---

## 🚀 部署建议

1. 先在开发环境测试所有功能
2. 使用微信开发者工具测试Socket连接
3. 确认所有域名配置正确
4. 提交审核前进行完整测试
5. 发布后监控用户反馈
