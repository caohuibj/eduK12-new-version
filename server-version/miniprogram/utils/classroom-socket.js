// utils/classroom-socket.js
// 课堂Socket通信封装

class ClassroomSocket {
  constructor(options = {}) {
    this.classroomId = options.classroomId
    this.role = options.role || 'student'
    this.studentId = options.studentId
    this.socket = null
    this.listeners = {}
    this.connected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
  }

  // 连接Socket
  connect() {
    return new Promise((resolve, reject) => {
      // 构建WebSocket URL
      const baseUrl = 'wss://your-domain.com/classroom'
      let url = `${baseUrl}?classroomId=${this.classroomId}&role=${this.role}`
      
      if (this.studentId) {
        url += `&studentId=${this.studentId}`
      } else {
        // 生成临时学生ID
        const tempId = this.generateTempId()
        url += `&tempStudentId=${tempId}`
      }

      console.log('连接Socket:', url)

      // 创建Socket连接
      this.socket = wx.connectSocket({
        url: url,
        success: () => {
          console.log('Socket连接中...')
        },
        fail: (err) => {
          console.error('Socket连接失败', err)
          reject(err)
        }
      })

      // 监听Socket打开
      wx.onSocketOpen(() => {
        console.log('Socket已打开')
        this.connected = true
        this.reconnectAttempts = 0
        this.trigger('connected')
        resolve()
      })

      // 监听Socket消息
      wx.onSocketMessage((res) => {
        try {
          const data = JSON.parse(res.data)
          console.log('收到消息:', data)
          this.trigger(data.event, data.data)
        } catch (err) {
          console.error('解析消息失败', err)
        }
      })

      // 监听Socket关闭
      wx.onSocketClose(() => {
        console.log('Socket已关闭')
        this.connected = false
        this.trigger('disconnected')
        
        // 自动重连
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnect()
        }
      })

      // 监听Socket错误
      wx.onSocketError((err) => {
        console.error('Socket错误', err)
        this.trigger('error', err)
        reject(err)
      })
    })
  }

  // 发送消息
  emit(event, data) {
    if (!this.connected) {
      console.warn('Socket未连接')
      return
    }

    const message = JSON.stringify({ event, data })
    
    wx.sendSocketMessage({
      data: message,
      success: () => {
        console.log('消息发送成功', event)
      },
      fail: (err) => {
        console.error('消息发送失败', err)
      }
    })
  }

  // 监听事件
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  // 移除监听
  off(event, callback) {
    if (this.listeners[event]) {
      if (callback) {
        const index = this.listeners[event].indexOf(callback)
        if (index > -1) {
          this.listeners[event].splice(index, 1)
        }
      } else {
        this.listeners[event] = []
      }
    }
  }

  // 触发事件
  trigger(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data)
        } catch (err) {
          console.error(`事件回调错误 [${event}]`, err)
        }
      })
    }
  }

  // 重连
  reconnect() {
    this.reconnectAttempts++
    console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    
    setTimeout(() => {
      this.connect().catch(err => {
        console.error('重连失败', err)
      })
    }, 2000 * this.reconnectAttempts)
  }

  // 生成临时学生ID
  generateTempId() {
    return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  // 关闭连接
  close() {
    if (this.connected) {
      wx.closeSocket()
      this.connected = false
      this.listeners = {}
    }
  }

  // 获取连接状态
  isConnected() {
    return this.connected
  }
}

module.exports = ClassroomSocket
