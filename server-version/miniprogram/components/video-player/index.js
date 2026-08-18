const { getVideoType, getBilibiliEmbedUrl } = require('../../utils/video')

Component({
  properties: {
    src: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: ''
    },
    poster: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: 'cos'
    }
  },

  data: {
    videoType: 'cos',
    showPlayBtn: true
  },

  observers: {
    'src': function(src) {
      if (src) {
        const type = getVideoType(src)
        this.setData({ videoType: type })
      }
    }
  },

  methods: {
    onPlay() {
      const { videoType, src, title } = this.data
      
      if (videoType === 'bilibili') {
        this.playBilibili()
      } else if (videoType === 'youtube') {
        this.showYoutubeTip()
      } else {
        this.setData({ showPlayBtn: false })
      }
    },

    playBilibili() {
      const { src, title } = this.data
      const embedUrl = getBilibiliEmbedUrl(src)
      if (embedUrl) {
        wx.navigateTo({
          url: `/pages/webview/index?url=${encodeURIComponent(embedUrl)}&title=${encodeURIComponent(title || '视频播放')}`
        })
      } else {
        wx.showToast({
          title: '无法解析视频链接',
          icon: 'none'
        })
      }
    },

    showYoutubeTip() {
      const { title } = this.data
      wx.showModal({
        title: '暂不支持',
        content: `「${title || '该视频'}」为YouTube视频，小程序暂不支持播放，请在网页端查看。`,
        showCancel: false,
        confirmText: '我知道了'
      })
    },

    onVideoError(e) {
      console.error('视频播放错误:', e.detail)
      wx.showToast({
        title: '视频加载失败',
        icon: 'none'
      })
    },

    onVideoEnded() {
      this.setData({ showPlayBtn: true })
    }
  }
})
