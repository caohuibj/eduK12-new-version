const assignmentsApi = require('../../../api/assignments')
const { isLoggedIn } = require('../../../utils/auth')
const { formatStatus } = require('../../../utils/format')

Page({
  data: {
    assignments: [],
    loading: true
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({ url: '/pages/login/index' })
      return
    }
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadAssignments()
  },

  onPullDownRefresh() {
    this.loadAssignments().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadAssignments() {
    this.setData({ loading: true })
    try {
      const res = await assignmentsApi.getMyAssignments()
      const list = res.data.list || []
      const assignments = list.map(item => {
        // 确保 submitted 是布尔值
        const submitted = !!item.submitted || (item.mySubmission && item.mySubmission.id)
        return {
          ...item,
          submitted,
          statusInfo: formatStatus(item.deadline, submitted)
        }
      })
      this.setData({ assignments })
    } catch (error) {
      console.error('加载作业失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onAssignmentTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/assignment/submit/submit?id=${id}` })
  }
})
