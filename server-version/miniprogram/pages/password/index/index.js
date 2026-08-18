const usersApi = require('../../../api/users')
const { validatePassword } = require('../../../utils/validate')

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    showOldPassword: false,
    showNewPassword: false,
    submitting: false
  },

  onOldPasswordInput(e) {
    this.setData({ oldPassword: e.detail.value })
  },

  onNewPasswordInput(e) {
    this.setData({ newPassword: e.detail.value })
  },

  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value })
  },

  toggleOldPassword() {
    this.setData({ showOldPassword: !this.data.showOldPassword })
  },

  toggleNewPassword() {
    this.setData({ showNewPassword: !this.data.showNewPassword })
  },

  async onSubmit() {
    const { oldPassword, newPassword, confirmPassword, submitting } = this.data
    if (submitting) return

    if (!oldPassword) {
      wx.showToast({ title: '请输入原密码', icon: 'none' })
      return
    }

    const result = validatePassword(newPassword)
    if (!result.valid) {
      wx.showToast({ title: result.message, icon: 'none' })
      return
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }

    if (oldPassword === newPassword) {
      wx.showToast({ title: '新密码不能与原密码相同', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await usersApi.changePassword({
        oldPassword,
        newPassword
      })
      wx.showToast({ title: '修改成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (error) {
      console.error('修改密码失败:', error)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
