const checkinsApi = require('../../../api/checkins')
const { isLoggedIn } = require('../../../utils/auth')
const { formatStatus } = require('../../../utils/format')

Page({
  data: {
    checkins: [],
    nextCursor: null,
    hasMore: false,
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
    this.loadCheckins()
  },

  onPullDownRefresh() {
    this.loadCheckins().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onUnload() { this.loadSequence = (this.loadSequence || 0) + 1 },

  onReachBottom() { if (this.data.hasMore && !this.data.loading) return this.loadCheckins(true) },

  async loadCheckins(append = false) {
    if (append && (this.data.loading || !this.data.nextCursor)) return
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1
    this.setData({ loading: true })
    try {
      const res = await checkinsApi.getMyCheckins(append ? this.data.nextCursor : null)
      if (sequence !== this.loadSequence) return
      const list = res.data?.list || []
      const checkins = list.map(item => {
        // 确保 submitted 是布尔值
        const submitted = !!(item.submission && item.submission.id)
        return {
          ...item,
          submitted,
          statusInfo: formatStatus(item.endTime, submitted)
        }
      })
      this.setData({ checkins: append ? this.data.checkins.concat(checkins) : checkins, nextCursor: res.data.nextCursor || null, hasMore: res.data.hasMore === true })
    } catch (error) {
      console.error('加载打卡失败:', error)
    } finally {
      if (sequence === this.loadSequence) this.setData({ loading: false })
    }
  },

  onCheckinTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/checkin/submit/submit?id=${id}` })
  }
})
