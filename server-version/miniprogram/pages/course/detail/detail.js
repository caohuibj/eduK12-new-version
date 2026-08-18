const coursesApi = require('../../../api/courses')
const questionnairesApi = require('../../../api/questionnaires')
const format = require('../../../utils/format')

Page({
  data: {
    course: null,
    activeTab: 'assignments',
    assignments: [],
    checkins: [],
    questionnaires: [],
    loading: true,
    // 未完成数量角标
    uncompletedAssignments: 0,
    uncompletedCheckins: 0,
    uncompletedQuestionnaires: 0
  },

  courseId: null,

  onLoad(options) {
    this.courseId = options.id
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadCourseDetail()
  },

  onPullDownRefresh() {
    this.loadCourseDetail().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadCourseDetail() {
    this.setData({ loading: true })
    try {
      const [courseRes, assignmentsRes, checkinsRes, questionnairesRes] = await Promise.all([
        coursesApi.getCourseDetail(this.courseId),
        coursesApi.getCourseAssignments(this.courseId),
        coursesApi.getCourseCheckins(this.courseId),
        questionnairesApi.getAvailableQuestionnaires(this.courseId)
      ])
      
      const rawAssignments = assignmentsRes.data?.list || []
      const rawCheckins = checkinsRes.data?.list || []
      const rawQuestionnaires = questionnairesRes.data?.list || []
      
      // 处理作业数据
      const assignments = rawAssignments.map(item => ({
        ...item,
        submitted: item.submitted || (item.mySubmission && !!item.mySubmission.id),
        isOverdue: item.deadline ? new Date(item.deadline) < new Date() : false,
        isNew: format.isNew(item.createdAt, 3)
      }))
      
      // 处理打卡数据
      const checkins = rawCheckins.map(item => ({
        ...item,
        submitted: item.submitted || (item.submission && !!item.submission.id),
        isOverdue: item.endTime ? new Date(item.endTime) < new Date() : false,
        isNew: format.isNew(item.createdAt, 3)
      }))
      
      // 处理问卷数据
      const questionnaires = rawQuestionnaires.map(item => ({
        ...item,
        isNew: format.isNew(item.createdAt, 3)
      }))
      
      // 计算未完成数量
      const uncompletedAssignments = assignments.filter(a => !a.submitted).length
      const uncompletedCheckins = checkins.filter(c => !c.submitted).length
      const uncompletedQuestionnaires = questionnaires.filter(q => !q.completed).length
      
      this.setData({
        course: courseRes.data || courseRes,
        assignments,
        checkins,
        questionnaires,
        uncompletedAssignments,
        uncompletedCheckins,
        uncompletedQuestionnaires
      })
    } catch (error) {
      console.error('加载课程详情失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onSwitchTab(e) {
    const { tab } = e.currentTarget.dataset
    this.setData({ activeTab: tab })
  },

  // 格式化日期
  formatDate(dateString) {
    return format.formatDate(dateString)
  },

  // 判断是否过期
  isOverdue(deadline) {
    if (!deadline) return false
    return new Date(deadline) < new Date()
  },

  // 判断是否为新任务（3天内创建）
  isNew(createdAt) {
    return format.isNew(createdAt, 3)
  },

  // 跳转作业详情
  onAssignmentTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/assignment/submit/submit?id=${id}` })
  },

  // 跳转打卡详情
  onCheckinTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/checkin/submit/submit?id=${id}` })
  },

  // 跳转问卷测评
  onQuestionnaireTap(e) {
    const { id, completed, assessmentid } = e.currentTarget.dataset
    if (completed && assessmentid) {
      // 已完成，跳转到结果页（使用 assessmentId）
      wx.navigateTo({ url: `/pages/questionnaire/result/result?id=${assessmentid}` })
    } else {
      // 未完成，开始测评（使用 questionnaireId）
      wx.navigateTo({ url: `/pages/questionnaire/assessment/assessment?id=${id}` })
    }
  }
})
