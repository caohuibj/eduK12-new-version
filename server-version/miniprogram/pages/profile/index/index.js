const usersApi = require('../../../api/users')
const { getUserInfo, setUserInfo, logout, isLoggedIn } = require('../../../utils/auth')
const { validateNickname } = require('../../../utils/validate')

Page({
  data: {
    userInfo: null,
    nickname: '',
    loading: true,
    saving: false
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({ url: '/pages/login/index' })
      return
    }
    this.loadUserInfo()
  },

  onShow() {
    if (isLoggedIn()) {
      this.loadUserInfo()
    }
  },

  async loadUserInfo() {
    this.setData({ loading: true })
    try {
      const res = await usersApi.getUserInfo()
      this.setData({
        userInfo: res.data,
        nickname: res.data.nickname || ''
      })
      setUserInfo(res.data)
    } catch (error) {
      console.error('加载用户信息失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  async onSaveNickname() {
    const { nickname, saving, userInfo } = this.data
    if (saving) return

    const result = validateNickname(nickname)
    if (!result.valid) {
      wx.showToast({ title: result.message, icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const res = await usersApi.updateUserInfo(userInfo.id, { nickname: nickname.trim() })
      setUserInfo(res.data)
      this.setData({ userInfo: res.data })
      wx.showToast({ title: '修改成功', icon: 'success' })
    } catch (error) {
      console.error('修改失败:', error)
    } finally {
      this.setData({ saving: false })
    }
  },

  onGoPassword() {
    wx.navigateTo({ url: '/pages/password/index/index' })
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout()
        }
      }
    })
  }
})
