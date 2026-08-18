const coursesApi = require('../../api/courses')
const { isLoggedIn } = require('../../utils/auth')

Page({
  data: {
    courses: [],
    loading: true,
    showJoinModal: false,
    courseCode: '',
    joining: false
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({ url: '/pages/login/index' })
      return
    }
    this.loadCourses()
  },

  onShow() {
    if (isLoggedIn()) {
      this.loadCourses()
    }
  },

  onPullDownRefresh() {
    this.loadCourses().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadCourses() {
    this.setData({ loading: true })
    try {
      const res = await coursesApi.getMyCourses()
      this.setData({ courses: res.data.list || [] })
    } catch (error) {
      console.error('加载课程失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onCourseTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/course/detail/detail?id=${id}` })
  },

  onShowJoinModal() {
    this.setData({ showJoinModal: true, courseCode: '' })
  },

  onHideJoinModal() {
    this.setData({ showJoinModal: false })
  },

  onCourseCodeInput(e) {
    this.setData({ courseCode: e.detail.value })
  },

  async onJoinCourse() {
    const { courseCode, joining } = this.data
    if (joining) return
    if (!courseCode || courseCode.trim().length < 4) {
      wx.showToast({ title: '请输入正确的课程码', icon: 'none' })
      return
    }

    this.setData({ joining: true })
    try {
      await coursesApi.joinCourse(courseCode.trim())
      wx.showToast({ title: '加入成功', icon: 'success' })
      this.setData({ showJoinModal: false })
      this.loadCourses()
    } catch (error) {
      console.error('加入课程失败:', error)
    } finally {
      this.setData({ joining: false })
    }
  }
})
