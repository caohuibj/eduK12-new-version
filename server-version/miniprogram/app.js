App({
  globalData: {
    userInfo: null,
    token: null,
    baseUrl: 'https://api.eduk12.top'
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
