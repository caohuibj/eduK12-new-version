const authApi = require('../../api/auth')
const { setToken, setUserInfo } = require('../../utils/auth')
const { validateUsername, validatePassword } = require('../../utils/validate')

Page({
  data: {
    username: '',
    password: '',
    loading: false
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  async onLogin() {
    const { username, password, loading } = this.data
    if (loading) return

    const usernameResult = validateUsername(username)
    if (!usernameResult.valid) {
      wx.showToast({ title: usernameResult.message, icon: 'none' })
      return
    }

    const passwordResult = validatePassword(password)
    if (!passwordResult.valid) {
      wx.showToast({ title: passwordResult.message, icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const res = await authApi.login({ username: username.trim(), password })
      setToken(res.data.token)
      setUserInfo(res.data.user)
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 1000)
    } catch (error) {
      console.error('登录失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pages/register/index' })
  }
})
