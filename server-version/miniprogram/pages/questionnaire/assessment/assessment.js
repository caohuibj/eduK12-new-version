const questionnairesApi = require('../../../api/questionnaires')
const scalesApi = require('../../../api/scales')

Page({
  data: {
    questionnaire: null,
    assessment: null,
    currentScaleIndex: 0,
    currentScale: null,
    items: [],
    currentIndex: 0,  // 当前题目索引
    currentItem: null,  // 当前题目
    answers: {},
    loading: true,
    submitting: false,
    progress: 0,
    answeredCount: 0,
    totalScales: 1,
    labels: [],
    error: null,
    showNav: false,  // 是否显示题目导航
    overallProgress: 0,
    scaleProgress: 0
  },

  questionnaireId: null,
  assessmentId: null,
  scaleAssessmentId: null,
  itemStartTime: null,

  onLoad(options) {
    console.log('assessment onLoad, options:', options)
    this.questionnaireId = options.id
    this.itemStartTime = Date.now()
    if (!this.questionnaireId) {
      wx.showToast({ title: '问卷ID不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.loadQuestionnaire()
  },

  async loadQuestionnaire() {
    this.setData({ loading: true, error: null })
    this.itemStartTime = Date.now()
    try {
      // 先检查是否已经完成
      console.log('检查问卷是否已完成...')
      const availableRes = await questionnairesApi.getAvailableQuestionnaires()
      const availableList = availableRes.data?.list || []
      const existingRecord = availableList.find(q => q.id === this.questionnaireId)
      
      console.log('existingRecord:', existingRecord)
      
      if (existingRecord && existingRecord.completed && existingRecord.assessmentId) {
        console.log('问卷已完成，跳转到结果页')
        wx.redirectTo({
          url: `/pages/questionnaire/result/result?id=${existingRecord.assessmentId}`
        })
        return
      }
      
      // 开始/继续测评
      console.log('调用 startAssessment API...')
      const response = await questionnairesApi.startAssessment(this.questionnaireId)
      console.log('startAssessment 原始响应:', response)
      
      const data = response.data || response
      console.log('startAssessment 数据:', JSON.stringify(data, null, 2))
      
      // 检查是否已完成
      if (data.questionnaireAssessment?.status === 'COMPLETED' || !data.currentScale) {
        console.log('测评已完成或没有当前量表')
        wx.redirectTo({
          url: `/pages/questionnaire/result/result?id=${data.questionnaireAssessment?.id || data.id}`
        })
        return
      }

      this.initScaleData(data)
      
      // 恢复已有答案
      if (this.scaleAssessmentId) {
        this.fetchExistingAnswers(this.scaleAssessmentId)
      }
      
    } catch (error) {
      console.error('加载问卷失败:', error)
      this.setData({ 
        loading: false,
        error: '加载失败: ' + (error.message || '未知错误')
      })
    }
  },

  /**
   * 初始化量表数据
   */
  initScaleData(data) {
    const currentScale = data.currentScale
    this.assessmentId = data.questionnaireAssessment?.id
    this.scaleAssessmentId = currentScale?.scaleAssessmentId
    
    // 获取 items
    let items = currentScale?.items || []
    
    // 获取 labels
    let labels = currentScale?.config?.labels || null
    
    // 处理 items 格式
    items = items.map((item) => {
      let options = item.options
      if (options && typeof options === 'string') {
        try {
          options = JSON.parse(options)
        } catch (e) {
          options = null
        }
      }
      
      if ((!options || options.length === 0) && labels && labels.length > 0) {
        options = labels
      }
      
      if (!options || options.length === 0) {
        const points = currentScale?.config?.points || 5
        options = []
        for (let i = 1; i <= points; i++) {
          options.push({ value: i, label: String(i) })
        }
      }
      
      return {
        ...item,
        options: options,
        text: item.content || item.text || ''
      }
    })
    
    if (items.length === 0) {
      this.setData({ 
        loading: false,
        error: '量表暂无题目'
      })
      return
    }
    
    const totalScales = data.totalScales || 1
    const currentScaleIndex = data.questionnaireAssessment?.currentScaleIndex || 0
    
    this.setData({
      questionnaire: { id: this.questionnaireId },
      assessment: data.questionnaireAssessment,
      currentScale: currentScale,
      currentScaleIndex: currentScaleIndex,
      items: items,
      currentItem: items[0],
      currentIndex: 0,
      labels: labels,
      answers: {},
      answeredCount: 0,
      totalScales: totalScales,
      loading: false,
      scaleProgress: 0,
      overallProgress: Math.round((currentScaleIndex / totalScales) * 100)
    })
  },

  async fetchExistingAnswers(assessmentId) {
    try {
      const response = await scalesApi.getAssessment(assessmentId)
      if (response.data?.answers) {
        const existingAnswers = {}
        response.data.answers.forEach(a => {
          existingAnswers[a.itemId] = a.value
        })
        const answeredCount = Object.keys(existingAnswers).length
        const scaleProgress = Math.round((answeredCount / this.data.items.length) * 100)
        
        this.setData({ 
          answers: existingAnswers,
          answeredCount: answeredCount,
          scaleProgress: scaleProgress,
          overallProgress: Math.round(((this.data.currentScaleIndex + scaleProgress / 100) / this.data.totalScales) * 100)
        })
      }
    } catch (err) {
      console.error('获取已有答案失败:', err)
    }
  },

  /**
   * 选择答案
   */
  onAnswer(e) {
    const { itemId, value } = e.currentTarget.dataset
    const { items, answers, currentIndex } = this.data
    
    // 计算作答时间
    const responseTime = Date.now() - this.itemStartTime
    
    // 更新本地状态
    const newAnswers = { ...answers, [itemId]: value }
    const answeredCount = Object.keys(newAnswers).length
    const scaleProgress = Math.round((answeredCount / items.length) * 100)
    
    this.setData({ 
      answers: newAnswers,
      answeredCount: answeredCount,
      scaleProgress: scaleProgress,
      overallProgress: Math.round(((this.data.currentScaleIndex + scaleProgress / 100) / this.data.totalScales) * 100)
    })
    
    // 提交答案到服务器
    this.submitAnswer(itemId, value, responseTime)
    
    // 自动跳到下一题（如果不是最后一题）
    if (currentIndex < items.length - 1) {
      setTimeout(() => {
        this.goToQuestion(currentIndex + 1)
      }, 300)
    }
  },

  async submitAnswer(itemId, value, responseTime) {
    if (!this.scaleAssessmentId) return
    try {
      await scalesApi.submitAnswer(this.scaleAssessmentId, {
        itemId: itemId,
        value: value,
        responseTime: responseTime
      })
    } catch (err) {
      console.error('提交答案失败:', err)
    }
  },

  /**
   * 上一题
   */
  onPrev() {
    const { currentIndex } = this.data
    if (currentIndex > 0) {
      this.goToQuestion(currentIndex - 1)
    }
  },

  /**
   * 下一题
   */
  onNext() {
    const { currentIndex, items } = this.data
    if (currentIndex < items.length - 1) {
      this.goToQuestion(currentIndex + 1)
    }
  },

  /**
   * 跳转到指定题目
   */
  goToQuestion(index) {
    const { items } = this.data
    if (index >= 0 && index < items.length) {
      this.itemStartTime = Date.now()
      this.setData({
        currentIndex: index,
        currentItem: items[index]
      })
    }
  },

  /**
   * 题目导航点击
   */
  onNavToQuestion(e) {
    const { index } = e.currentTarget.dataset
    this.goToQuestion(index)
  },

  /**
   * 切换题目导航显示
   */
  toggleNav() {
    this.setData({ showNav: !this.data.showNav })
  },

  /**
   * 完成当前量表
   */
  async onCompleteScale() {
    const { items, answers, currentScaleIndex, totalScales } = this.data
    const answeredCount = Object.keys(answers).length
    
    // 检查是否有未答题目
    if (answeredCount < items.length) {
      const res = await new Promise((resolve) => {
        wx.showModal({
          title: '提示',
          content: `还有 ${items.length - answeredCount} 道题目未作答，确定要提交吗？`,
          success: (r) => resolve(r.confirm)
        })
      })
      if (!res) return
    }

    this.setData({ submitting: true })
    try {
      // 完成当前量表
      await scalesApi.completeAssessment(this.scaleAssessmentId)

      // 检查是否还有下一个量表
      const statusResponse = await questionnairesApi.startAssessment(this.questionnaireId)
      const status = statusResponse.data || statusResponse
      
      if (status.questionnaireAssessment?.status === 'COMPLETED' || !status.currentScale) {
        // 所有量表完成
        await questionnairesApi.completeAssessment(this.assessmentId)
        wx.showToast({ title: '测评完成', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ 
            url: `/pages/questionnaire/result/result?id=${this.assessmentId}` 
          })
        }, 1000)
      } else {
        // 切换到下一个量表
        this.initScaleData(status)
        wx.showToast({ title: '进入下一个量表', icon: 'none' })
      }
    } catch (error) {
      console.error('提交失败:', error)
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
