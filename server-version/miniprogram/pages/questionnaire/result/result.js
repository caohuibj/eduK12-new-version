const questionnairesApi = require('../../../api/questionnaires')
const format = require('../../../utils/format')

Page({
  data: {
    report: null,
    loading: true,
    error: null
  },

  assessmentId: null,

  onLoad(options) {
    this.assessmentId = options.id
    this.loadReport()
  },

  async loadReport() {
    this.setData({ loading: true, error: null })
    try {
      const res = await questionnairesApi.getReport(this.assessmentId)
      const rawData = res.data || res
      
      // 构建适配小程序显示的报告数据
      const report = this.formatReport(rawData)
      this.setData({ report })
    } catch (error) {
      console.error('加载报告失败:', error)
      this.setData({ 
        error: error.message || '加载失败',
        loading: false 
      })
      wx.showToast({ title: '加载失败', icon: 'none' })
      return
    }
    this.setData({ loading: false })
  },

  /**
   * 格式化报告数据以适配小程序显示
   */
  formatReport(rawData) {
    const aggregateReport = rawData.aggregateReport || {}
    const scaleReports = aggregateReport.scaleReports || []
    
    // 汇总所有维度的反馈
    const allDimensions = []
    const allSuggestions = []
    
    scaleReports.forEach((scale, scaleIndex) => {
      const feedback = scale.feedback || {}
      
      // 收集维度信息 - 优先从 feedback.dimensions 获取完整数据
      const feedbackDimensions = feedback.dimensions || []
      const dimensionScores = scale.dimensionScores || []
      
      // 合并维度数据
      feedbackDimensions.forEach(dim => {
        allDimensions.push({
          name: dim.dimensionName || dim.name || `维度${scaleIndex + 1}`,
          score: dim.score || 0,
          maxScore: dim.maxScore || 100,
          minScore: dim.minScore || 0,
          normalizedScore: dim.normalizedScore || dim.score || 0,
          percent: this.calculatePercent(dim.score, dim.minScore, dim.maxScore),
          feedback: dim.interpretation || dim.feedback || '',
          level: dim.level || '',
          levelName: dim.levelName || '',
          levelText: this.getLevelLabel(dim.level, dim.levelName),
          levelClass: this.getLevelClass(dim.level),
          interpretation: dim.interpretation || '',
          suggestions: dim.suggestions || [],
          scaleName: scale.scaleName || ''
        })
        
        // 收集维度建议
        if (dim.suggestions && dim.suggestions.length > 0) {
          allSuggestions.push(...dim.suggestions)
        }
      })
      
      // 如果 feedback.dimensions 为空，使用 dimensionScores
      if (feedbackDimensions.length === 0 && dimensionScores.length > 0) {
        dimensionScores.forEach(dim => {
          allDimensions.push({
            name: dim.dimensionName || dim.name || `维度${scaleIndex + 1}`,
            score: dim.score || 0,
            maxScore: dim.maxScore || 100,
            minScore: dim.minScore || 0,
            normalizedScore: dim.normalizedScore || dim.score || 0,
            percent: this.calculatePercent(dim.score, dim.minScore, dim.maxScore),
            feedback: dim.interpretation || '',
            level: dim.level || '',
            levelName: '',
            levelText: this.getLevelLabel(dim.level, ''),
            levelClass: this.getLevelClass(dim.level),
            interpretation: '',
            suggestions: [],
            scaleName: scale.scaleName || ''
          })
        })
      }
      
      // 收集量表级别的建议
      if (feedback.suggestions && feedback.suggestions.length > 0) {
        allSuggestions.push(...feedback.suggestions)
      }
    })

    // 计算总分
    const totalScore = aggregateReport.averageScore || 
      (allDimensions.length > 0 
        ? (allDimensions.reduce((sum, d) => sum + d.normalizedScore, 0) / allDimensions.length).toFixed(1)
        : 0)

    return {
      questionnaireName: rawData.questionnaireName || aggregateReport.questionnaireName || '测评报告',
      completedAt: rawData.completedAt ? format.formatTime(rawData.completedAt) : '',
      totalTime: rawData.totalTime ? Math.round(rawData.totalTime / 60000) : 0, // 转换为分钟
      totalScore: totalScore,
      averageScore: aggregateReport.averageScore || 0,
      totalDimensions: aggregateReport.totalDimensions || allDimensions.length,
      summary: aggregateReport.overallSummary || '',
      dimensions: allDimensions,
      suggestions: allSuggestions,
      scaleReports: scaleReports.map(scale => ({
        scaleId: scale.scaleId,
        scaleName: scale.scaleName || '量表',
        totalScore: scale.feedback?.totalScore || 0,
        summary: scale.feedback?.overall || scale.feedback?.summary || '',
        dimensions: (scale.feedback?.dimensions || scale.dimensionScores || []).map(dim => ({
          name: dim.dimensionName || dim.name,
          score: dim.score || 0,
          maxScore: dim.maxScore || 100,
          minScore: dim.minScore || 0,
          normalizedScore: dim.normalizedScore || dim.score || 0,
          percent: this.calculatePercent(dim.score, dim.minScore, dim.maxScore),
          level: dim.level || '',
          levelName: dim.levelName || '',
          levelText: this.getLevelLabel(dim.level, dim.levelName),
          levelClass: this.getLevelClass(dim.level),
          feedback: dim.interpretation || dim.feedback || '',
          interpretation: dim.interpretation || '',
          suggestions: dim.suggestions || []
        }))
      }))
    }
  },

  /**
   * 获取 level 对应的标签文字
   */
  getLevelLabel(level, levelName) {
    if (levelName) return levelName
    switch (level) {
      case 'high': return '较高'
      case 'medium': return '中等'
      case 'low': return '较低'
      default: return ''
    }
  },

  /**
   * 获取 level 对应的颜色类名
   */
  getLevelClass(level) {
    switch (level) {
      case 'high': return 'level-high'
      case 'medium': return 'level-medium'
      case 'low': return 'level-low'
      default: return ''
    }
  },

  /**
   * 计算百分比（考虑最小值）
   */
  calculatePercent(score, minScore, maxScore) {
    const s = Number(score) || 0
    const min = Number(minScore) || 0
    const max = Number(maxScore) || 100
    
    if (max === min) return 0
    const percent = Math.round(((s - min) / (max - min)) * 100)
    return Math.max(0, Math.min(100, percent))
  },

  formatDate(dateStr) {
    return format.formatTime(dateStr)
  },

  onBack() {
    wx.navigateBack()
  },

  onShare() {
    // 触发分享
  },

  // 分享给朋友
  onShareAppMessage() {
    const report = this.data.report
    return {
      title: `我的${report?.questionnaireName || '测评'}报告`,
      path: `/pages/questionnaire/result/result?id=${this.assessmentId}`,
      imageUrl: '' // 可选：自定义分享图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    const report = this.data.report
    return {
      title: `${report?.questionnaireName || '测评'}报告 - 慧育空间`,
      query: `id=${this.assessmentId}`,
      imageUrl: ''
    }
  }
})
