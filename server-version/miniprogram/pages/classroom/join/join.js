// pages/classroom/join/join.js
const app = getApp()
const api = require('../../../api/index')

Page({
  data: {
    code: '',
    classroom: null,
    loading: false,
    error: null
  },

  onLoad(options) {
    // 从二维码或分享链接获取课堂码
    if (options.code) {
      this.setData({ code: options.code })
      this.fetchClassroom(options.code)
    }
    
    // 从扫码进入
    if (options.scene) {
      const scene = decodeURIComponent(options.scene)
      const code = scene.split('code=')[1]
      if (code) {
        this.setData({ code })
        this.fetchClassroom(code)
      }
    }
  },

  // 输入课堂码
  onCodeInput(e) {
    this.setData({ code: e.detail.value.toUpperCase() })
  },

  // 获取课堂信息
  async fetchClassroom(code) {
    if (!code) {
      wx.showToast({
        title: '请输入课堂码',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true, error: null })

    try {
      const res = await api.classroom.getByCode(code)
      
      if (res.code === 0) {
        this.setData({ 
          classroom: res.data,
          loading: false 
        })
      } else {
        this.setData({ 
          error: res.message || '课堂不存在',
          loading: false 
        })
      }
    } catch (err) {
      this.setData({ 
        error: err.message || '获取课堂信息失败',
        loading: false 
      })
    }
  },

  // 加入课堂
  joinClassroom() {
    const { classroom } = this.data

    if (!classroom) {
      wx.showToast({
        title: '课堂信息加载中',
        icon: 'none'
      })
      return
    }

    if (classroom.status === 'ENDED') {
      wx.showToast({
        title: '课堂已结束',
        icon: 'none'
      })
      return
    }

    // 跳转到答题页面
    wx.navigateTo({
      url: `/pages/classroom/answer/answer?classroomId=${classroom.id}`
    })
  },

  // 扫码加入
  scanCode() {
    wx.scanCode({
      success: (res) => {
        // 解析二维码内容
        let code = res.result
        
        // 如果是完整URL，提取code参数
        if (code.includes('code=')) {
          const match = code.match(/code=([^&]+)/)
          if (match) {
            code = match[1]
          }
        }
        
        this.setData({ code })
        this.fetchClassroom(code)
      },
      fail: (err) => {
        console.error('扫码失败', err)
      }
    })
  },

  // 返回首页
  goBack() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
