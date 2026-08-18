const checkinsApi = require('../../../api/checkins')
const { isLoggedIn } = require('../../../utils/auth')
const { formatStatus } = require('../../../utils/format')

Page({
  data: {
    checkins: [],
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

  async loadCheckins() {
    this.setData({ loading: true })
    try {
      const res = await checkinsApi.getMyCheckins()
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
      this.setData({ checkins })
    } catch (error) {
      console.error('加载打卡失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onCheckinTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/checkin/submit/submit?id=${id}` })
  }
})
