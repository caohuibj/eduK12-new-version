const assignmentsApi = require('../../../api/assignments')
const { formatTime } = require('../../../utils/format')
const { getBaseUrl } = require('../../../utils/request')

Page({
  data: {
    assignment: null,
    submission: null,
    answers: {},
    multiAnswers: {},
    textAnswers: {},
    content: '',
    loading: true,
    submitting: false,
    baseUrl: '',
    iframeVideos: [],
    editing: false
  },

  onLoad(options) {
    this.setData({ baseUrl: getBaseUrl() })
    this.assignmentId = options.id
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [assignmentRes, submissionRes] = await Promise.all([
        assignmentsApi.getAssignmentDetail(this.assignmentId),
        assignmentsApi.getMySubmission(this.assignmentId).catch(() => ({ data: null }))
      ])
      
      const assignment = assignmentRes.data
      
      // 检查是否已截止
      let isExpired = false
      if (assignment.deadline) {
        const now = new Date()
        const deadline = new Date(assignment.deadline)
        isExpired = now > deadline
      }
      
      assignment.isExpired = isExpired
      
      if (assignment.questions) {
        try {
          assignment.questionsList = typeof assignment.questions === 'string' 
            ? JSON.parse(assignment.questions) 
            : assignment.questions
        } catch (e) {
          assignment.questionsList = []
        }
      }
      
      const iframeVideos = this.extractIframeVideos(assignment.content || '')
      assignment.contentText = this.extractTextContent(assignment.content || '')
      
      this.setData({
        assignment,
        iframeVideos,
        submission: submissionRes.data,
        content: submissionRes.data?.content || ''
      })
      
      if (submissionRes.data?.answers && assignment.questionsList) {
        const loadedAnswers = {}
        const loadedMultiAnswers = {}
        const loadedTextAnswers = {}
        
        assignment.questionsList.forEach((q, index) => {
          const answer = submissionRes.data.answers[index.toString()]
          if (q.type === 'single_choice') {
            loadedAnswers[index] = answer
          } else if (q.type === 'multiple_choice') {
            loadedMultiAnswers[index] = answer ? answer.split(',').filter(k => k) : []
          } else if (q.type === 'text') {
            loadedTextAnswers[index] = answer
          }
        })
        
        this.setData({
          answers: loadedAnswers,
          multiAnswers: loadedMultiAnswers,
          textAnswers: loadedTextAnswers
        })
      }
    } catch (error) {
      console.error('加载作业失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  extractIframeVideos(htmlContent) {
    if (!htmlContent) return []
    
    const decodedContent = htmlContent
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
    
    const videos = []
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi
    let match
    
    while ((match = iframeRegex.exec(decodedContent)) !== null) {
      const src = match[1]
      if (src.includes('bilibili.com') || src.includes('player.bilibili.com')) {
        let bvid = ''
        const bvidMatch = src.match(/bvid=(BV[\w]+)/i) || src.match(/\/video\/(BV[\w]+)/i)
        if (bvidMatch) {
          bvid = bvidMatch[1]
        }
        
        if (bvid) {
          const fullUrl = `https://www.bilibili.com/video/${bvid}`
          videos.push({
            url: fullUrl,
            bvid: bvid,
            title: 'B站视频'
          })
        }
      }
    }
    
    return videos
  },

  extractTextContent(htmlContent) {
    if (!htmlContent) return ''
    
    let text = htmlContent
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/<iframe[^>]*\/?>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    
    return text
  },

  onIframeVideoTap(e) {
    const { url, bvid } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(url)}&title=${encodeURIComponent('B站视频')}`
    })
  },

  onOptionSelect(e) {
    const { index, key } = e.currentTarget.dataset
    const answers = { ...this.data.answers }
    answers[index] = key
    this.setData({ answers })
  },

  onTextAnswerInput(e) {
    const { index } = e.currentTarget.dataset
    const textAnswers = { ...this.data.textAnswers }
    textAnswers[index] = e.detail.value
    this.setData({ textAnswers })
  },

  onMultiOptionSelect(e) {
    const { index, key } = e.currentTarget.dataset
    const multiAnswers = { ...this.data.multiAnswers }
    let current = multiAnswers[index] || []
    
    if (current.includes(key)) {
      multiAnswers[index] = current.filter(k => k !== key)
    } else {
      multiAnswers[index] = [...current, key]
    }
    
    this.setData({ multiAnswers })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onEdit() {
    this.setData({ editing: true })
  },

  onCancelEdit() {
    this.setData({ editing: false })
  },

  onVideoTap(e) {
    const { url, title } = e.currentTarget.dataset
    let videoUrl = url
    if (url.startsWith('/uploads/')) {
      videoUrl = this.data.baseUrl + url
    }
    wx.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(title || '视频播放')}`
    })
  },

  onExternalVideoTap(e) {
    const { url } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/webview/index?url=${encodeURIComponent(url)}&title=${encodeURIComponent('外部视频')}`
    })
  },

  onImageTap(e) {
    const { url } = e.currentTarget.dataset
    wx.previewImage({
      urls: [url]
    })
  },

  async onSubmit() {
    const { content, answers, multiAnswers, textAnswers, submitting, submission, assignment } = this.data
    if (submitting) return

    // 再次检查截止日期
    if (assignment?.isExpired && !submission) {
      wx.showToast({ title: '该作业已截止', icon: 'none' })
      return
    }

    const formattedAnswers = {}
    
    if (assignment.questionsList) {
      assignment.questionsList.forEach((q, index) => {
        if (q.type === 'single_choice') {
          const value = answers[index]
          if (value) {
            formattedAnswers[index.toString()] = value
          }
        } else if (q.type === 'multiple_choice') {
          const value = multiAnswers[index]
          if (value && value.length > 0) {
            formattedAnswers[index.toString()] = value.join(',')
          }
        } else if (q.type === 'text') {
          const value = textAnswers[index]
          if (value) {
            formattedAnswers[index.toString()] = value
          }
        }
      })
    }

    this.setData({ submitting: true })
    try {
      await assignmentsApi.submitAssignment(this.assignmentId, {
        content,
        answers: Object.keys(formattedAnswers).length > 0 ? formattedAnswers : undefined
      })
      wx.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (error) {
      console.error('提交失败:', error)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
