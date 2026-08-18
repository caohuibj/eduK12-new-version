const questionnairesApi = require('../../../api/questionnaires')
const format = require('../../../utils/format')

Page({
  data: {
    questionnaires: [],
    loading: true,
    courseId: null
  },

  onLoad(options) {
    this.setData({ courseId: options.courseId || null })
    this.loadQuestionnaires()
  },

  onPullDownRefresh() {
    this.loadQuestionnaires().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadQuestionnaires() {
    this.setData({ loading: true })
    try {
      const res = await questionnairesApi.getAvailableQuestionnaires(this.data.courseId)
      const list = (res.data?.list || []).map(item => ({
        ...item,
        isNew: format.isNew(item.createdAt, 3)
      }))
      this.setData({ questionnaires: list })
    } catch (error) {
      console.error('加载问卷列表失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onTap(e) {
    const { id, completed, inProgress, assessmentid } = e.currentTarget.dataset
    
    if (completed && assessmentid) {
      // 已完成，跳转到结果页
      wx.navigateTo({ url: `/pages/questionnaire/result/result?id=${assessmentid}` })
    } else if (inProgress && assessmentid) {
      // 进行中，继续作答
      wx.navigateTo({ url: `/pages/questionnaire/assessment/assessment?id=${id}` })
    } else {
      // 未开始，开始测评
      wx.navigateTo({ url: `/pages/questionnaire/assessment/assessment?id=${id}` })
    }
  }
})
