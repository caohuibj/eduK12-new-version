const { BASE_URL } = require('./config/env')

App({
  globalData: {
    userInfo: null,
    token: null,
    // Read-only build-time configuration; do not expose a runtime host setter.
    baseUrl: BASE_URL,
  },
  
  onLaunch() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
      this.checkLoginStatus()
    }
  },
  
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }
  },
  
  setToken(token) {
    this.globalData.token = token
    wx.setStorageSync('token', token)
  },
  
  clearToken() {
    this.globalData.token = null
    this.globalData.userInfo = null
    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
  }
})
