const coursesApi = require('../../api/courses')
const { isLoggedIn } = require('../../utils/auth')

Page({
  data: {
    courses: [],
    nextCursor: null,
    hasMore: false,
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

  onUnload() { this.loadSequence = (this.loadSequence || 0) + 1 },

  onReachBottom() { if (this.data.hasMore && !this.data.loading) return this.loadCourses(true) },

  async loadCourses(append = false) {
    if (append && (this.data.loading || !this.data.nextCursor)) return
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1
    this.setData({ loading: true })
    try {
      const res = await coursesApi.getMyCourses(append ? this.data.nextCursor : null)
      if (sequence !== this.loadSequence) return
      this.setData({ courses: append ? this.data.courses.concat(res.data.list || []) : res.data.list || [], nextCursor: res.data.nextCursor || null, hasMore: res.data.hasMore === true })
    } catch (error) {
      console.error('加载课程失败:', error)
    } finally {
      if (sequence === this.loadSequence) this.setData({ loading: false })
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
