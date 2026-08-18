const authApi = require('../../api/auth')
const { setToken, setUserInfo } = require('../../utils/auth')
const { validateUsername, validatePassword, validateNickname, validateCourseCode } = require('../../utils/validate')

Page({
  data: {
    courseCode: '',
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
    loading: false
  },

  onCourseCodeInput(e) {
    this.setData({ courseCode: e.detail.value })
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  async onRegister() {
    const { courseCode, username, password, confirmPassword, nickname, loading } = this.data
    if (loading) return

    const courseCodeResult = validateCourseCode(courseCode)
    if (!courseCodeResult.valid) {
      wx.showToast({ title: courseCodeResult.message, icon: 'none' })
      return
    }

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

    if (password !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }

    const nicknameResult = validateNickname(nickname)
    if (!nicknameResult.valid) {
      wx.showToast({ title: nicknameResult.message, icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const res = await authApi.studentRegister({
        courseCode: courseCode.trim(),
        username: username.trim(),
        password,
        nickname: nickname.trim()
      })
      setToken(res.data.token)
      setUserInfo(res.data.user)
      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 1000)
    } catch (error) {
      console.error('注册失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onGoLogin() {
    wx.navigateBack()
  }
})
