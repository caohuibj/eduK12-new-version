// pages/classroom/answer/answer.js
const app = getApp()
const ClassroomSocket = require('../../../utils/classroom-socket')

Page({
  data: {
    classroomId: '',
    question: null,
    answer: null,
    multiAnswers: [],
    submitted: false,
    countdown: 0,
    sessionId: null,
    isFinished: false,
    questionType: '', // 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'
    options: []
  },

  socket: null,
  timer: null,

  onLoad(options) {
    const { classroomId } = options
    if (!classroomId) {
      wx.showToast({
        title: '课堂ID不存在',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ classroomId })
    this.initSocket()
  },

  onUnload() {
    // 页面卸载时清理
    if (this.timer) {
      clearInterval(this.timer)
    }
    if (this.socket) {
      this.socket.close()
    }
  },

  // 初始化Socket连接
  initSocket() {
    const studentId = app.globalData.userInfo?.id

    this.socket = new ClassroomSocket({
      classroomId: this.data.classroomId,
      role: 'student',
      studentId: studentId
    })

    // 监听连接成功
    this.socket.on('connected', () => {
      console.log('Socket已连接')
    })

    // 监听学生加入成功
    this.socket.on('student:joined', (data) => {
      console.log('学生已加入课堂', data)
      this.setData({ sessionId: data.sessionId })
    })

    // 监听接收题目
    this.socket.on('broadcast:question', (data) => {
      console.log('收到题目', data)
      
      const questionType = data.questionContent.type
      const options = this.parseOptions(data.questionContent)

      this.setData({
        question: data,
        questionType,
        options,
        answer: null,
        multiAnswers: [],
        submitted: false,
        isFinished: false
      })

      // 启动倒计时
      if (data.timeLimit) {
        const initialTime = data.remainingTime !== undefined 
          ? data.remainingTime 
          : data.timeLimit
        this.startCountdown(initialTime)
      }
    })

    // 监听答题结束
    this.socket.on('broadcast:finished', () => {
      console.log('答题结束')
      this.stopCountdown()
      this.setData({ isFinished: true })
      
      wx.showToast({
        title: '答题已结束',
        icon: 'success'
      })
    })

    // 监听下一题
    this.socket.on('broadcast:next', () => {
      console.log('准备下一题')
      this.setData({
        question: null,
        answer: null,
        multiAnswers: [],
        submitted: false,
        countdown: 0,
        isFinished: false
      })
    })

    // 监听课堂关闭
    this.socket.on('broadcast:closed', () => {
      console.log('课堂关闭')
      wx.showModal({
        title: '提示',
        content: '课堂已结束',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      })
    })

    // 监听提交成功
    this.socket.on('student:submitted', () => {
      console.log('提交成功')
      this.setData({ submitted: true })
      wx.showToast({
        title: '提交成功',
        icon: 'success'
      })
    })

    // 监听错误
    this.socket.on('error', (err) => {
      console.error('Socket错误', err)
      wx.showToast({
        title: '连接错误',
        icon: 'none'
      })
    })

    // 连接Socket
    this.socket.connect().catch(err => {
      console.error('Socket连接失败', err)
      wx.showToast({
        title: '连接失败',
        icon: 'none'
      })
    })
  },

  // 解析选项
  parseOptions(questionContent) {
    const { type, options } = questionContent
    
    if (type === 'TRUE_FALSE') {
      return [
        { label: '正确', value: true },
        { label: '错误', value: false }
      ]
    }
    
    return options || []
  },

  // 启动倒计时
  startCountdown(seconds) {
    this.setData({ countdown: seconds })

    this.timer = setInterval(() => {
      const countdown = this.data.countdown - 1
      
      if (countdown <= 0) {
        this.stopCountdown()
        this.autoSubmit()
      } else {
        this.setData({ countdown })
      }
    }, 1000)
  },

  // 停止倒计时
  stopCountdown() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  // 自动提交
  autoSubmit() {
    if (!this.data.submitted && this.data.question) {
      wx.showToast({
        title: '时间到，自动提交',
        icon: 'none'
      })
      this.submitAnswer()
    }
  },

  // 选择答案（单选、判断）
  selectAnswer(e) {
    if (this.data.submitted) return

    const answer = e.currentTarget.dataset.answer
    this.setData({ answer })
  },

  // 选择答案（多选）
  toggleMultiAnswer(e) {
    if (this.data.submitted) return

    const option = e.currentTarget.dataset.option
    let multiAnswers = [...this.data.multiAnswers]

    const index = multiAnswers.indexOf(option)
    if (index > -1) {
      multiAnswers.splice(index, 1) // 取消选择
    } else {
      multiAnswers.push(option) // 添加选择
    }

    // 排序
    multiAnswers.sort()

    this.setData({ multiAnswers })
  },

  // 提交答案
  submitAnswer() {
    const { question, answer, multiAnswers, questionType, submitted } = this.data

    if (submitted) {
      wx.showToast({
        title: '已提交',
        icon: 'none'
      })
      return
    }

    if (!question) {
      wx.showToast({
        title: '暂无题目',
        icon: 'none'
      })
      return
    }

    let finalAnswer

    if (questionType === 'MULTIPLE_CHOICE') {
      if (multiAnswers.length === 0) {
        wx.showToast({
          title: '请选择答案',
          icon: 'none'
        })
        return
      }
      finalAnswer = multiAnswers
    } else {
      if (answer === null || answer === undefined) {
        wx.showToast({
          title: '请选择答案',
          icon: 'none'
        })
        return
      }
      finalAnswer = answer
    }

    // 提交答案
    this.socket.emit('student:submit', {
      questionId: question.questionId,
      answer: finalAnswer,
      questionIndex: question.questionIndex
    })

    // 停止倒计时
    this.stopCountdown()
  },

  // 退出课堂
  exitClassroom() {
    wx.showModal({
      title: '提示',
      content: '确定要退出课堂吗？',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      }
    })
  }
})
