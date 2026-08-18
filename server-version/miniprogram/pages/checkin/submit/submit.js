const checkinsApi = require('../../../api/checkins')
const uploadsApi = require('../../../api/uploads')
const { getBaseUrl } = require('../../../utils/request')

Page({
  data: {
    checkin: null,
    contentText: '',
    submission: null,
    content: '',
    images: [],
    checkinImages: [],
    checkinVideos: [],
    iframeVideos: [],
    baseUrl: '',
    loading: true,
    submitting: false,
    othersSubmissions: [],
    showOthers: false,
    loadingOthers: false
  },

  onLoad(options) {
    this.setData({ baseUrl: getBaseUrl() })
    this.checkinId = options.id
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [checkinRes, submissionRes] = await Promise.all([
        checkinsApi.getCheckinDetail(this.checkinId),
        checkinsApi.getMySubmission(this.checkinId).catch(() => ({ data: null }))
      ])
      
      const checkin = checkinRes.data
      
      // 处理打卡关联的图片和视频
      let checkinImages = []
      let checkinVideos = []
      
      // 检查是否已截止
      let isExpired = false
      if (checkin.endTime) {
        const now = new Date()
        const endTime = new Date(checkin.endTime)
        isExpired = now > endTime
      }
      
      checkin.isExpired = isExpired
      
      if (checkin.images) {
        try {
          checkinImages = typeof checkin.images === 'string' 
            ? JSON.parse(checkin.images) 
            : checkin.images
        } catch (e) {
          checkinImages = []
        }
      }
      
      if (checkin.videos) {
        try {
          checkinVideos = typeof checkin.videos === 'string' 
            ? JSON.parse(checkin.videos) 
            : checkin.videos
        } catch (e) {
          checkinVideos = []
        }
      }
      
      // 提取B站视频
      const iframeVideos = this.extractIframeVideos(checkin.content || '')
      const contentText = this.extractTextContent(checkin.content || '')
      
      this.setData({
        checkin,
        contentText,
        checkinImages,
        checkinVideos,
        iframeVideos,
        submission: submissionRes.data,
        content: submissionRes.data?.content || '',
        images: submissionRes.data?.images || []
      })
    } catch (error) {
      console.error('加载打卡失败:', error)
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
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '链接已复制，请在浏览器打开',
          icon: 'none',
          duration: 3000
        })
      }
    })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onChooseImage() {
    const { images, submission } = this.data
    if (submission || images.length >= 9) return

    wx.chooseMedia({
      count: 9 - images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        try {
          const uploadPromises = res.tempFiles.map(file => 
            uploadsApi.uploadImageAndWait(file.tempFilePath)
          )
          const results = await Promise.all(uploadPromises)
          // 过滤掉 undefined/null，确保所有 URL 都是有效字符串
          const newImages = results
            .map(r => r.url)
            .filter(url => url && typeof url === 'string')
          
          this.setData({
            images: [...images, ...newImages]
          })
        } catch (error) {
          console.error('上传失败:', error)
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  onPreviewImage(e) {
    const { src } = e.currentTarget.dataset
    wx.previewImage({
      current: src,
      urls: this.data.images
    })
  },

  onCheckinImageTap(e) {
    const { url } = e.currentTarget.dataset
    const fullUrl = url.startsWith('/uploads/') ? this.data.baseUrl + url : url
    wx.previewImage({
      current: fullUrl,
      urls: this.data.checkinImages.map(img => img.startsWith('/uploads/') ? this.data.baseUrl + img : img)
    })
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

  onDeleteImage(e) {
    const { index } = e.currentTarget.dataset
    const { images, submission } = this.data
    if (submission) return
    
    images.splice(index, 1)
    this.setData({ images })
  },

  async onViewOthers() {
    const { showOthers, loadingOthers } = this.data
    if (loadingOthers) return
    
    if (showOthers) {
      this.setData({ showOthers: false })
      return
    }
    
    this.setData({ loadingOthers: true })
    try {
      const res = await checkinsApi.getOthersSubmissions(this.checkinId)
      this.setData({
        othersSubmissions: res.data?.list || [],
        showOthers: true
      })
    } catch (error) {
      console.error('获取他人打卡失败:', error)
      wx.showToast({ title: '获取失败', icon: 'none' })
    } finally {
      this.setData({ loadingOthers: false })
    }
  },

  onPreviewOthersImage(e) {
    const { url, index, submissionIndex } = e.currentTarget.dataset
    const submission = this.data.othersSubmissions[submissionIndex]
    const images = submission.images || []
    const fullUrls = images.map(img => img.startsWith('/uploads/') ? this.data.baseUrl + img : img)
    
    wx.previewImage({
      current: fullUrls[index],
      urls: fullUrls
    })
  },

  async onSubmit() {
    const { content, images, submitting, submission, checkin } = this.data
    if (submitting || submission) return

    // 再次检查截止日期
    if (checkin?.isExpired && !submission) {
      wx.showToast({ title: '该打卡任务已截止', icon: 'none' })
      return
    }

    if (!content.trim() && images.length === 0) {
      wx.showToast({ title: '请输入打卡内容或上传图片', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      // 过滤掉空值，确保所有图片 URL 都是有效字符串
      const validImages = images.filter(url => url && typeof url === 'string' && url.trim())
      
      await checkinsApi.submitCheckin(this.checkinId, {
        content: content.trim() || '',
        images: validImages
      })
      wx.showToast({ title: '打卡成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (error) {
      console.error('打卡失败:', error)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
