Page({
  data: {
    url: '',
    title: '',
    isBilibili: false,
    videoUrl: '',
    bvid: '',
    loading: true
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || '')
    const title = decodeURIComponent(options.title || '视频播放')
    
    const { isBilibili, bvid } = this.extractBilibiliInfo(url)
    
    this.setData({ 
      url, 
      title,
      isBilibili,
      bvid,
      videoUrl: url,
      loading: false 
    })
    
    if (title) {
      wx.setNavigationBarTitle({ title })
    }
  },

  extractBilibiliInfo(url) {
    const bvidMatch = url.match(/bilibili\.com\/video\/(BV[\w]+)/i) 
                      || url.match(/b23\.tv\/([\w]+)/i)
                      || url.match(/(BV[\w]+)/i)
    
    return {
      isBilibili: !!bvidMatch,
      bvid: bvidMatch ? bvidMatch[1] : ''
    }
  },

  copyVideoUrl() {
    const { videoUrl } = this.data
    wx.setClipboardData({
      data: videoUrl,
      success: () => {
        wx.showToast({
          title: '链接已复制，请在浏览器打开',
          icon: 'none',
          duration: 3000
        })
      }
    })
  },

  onMessage(e) {
    console.log('WebView message:', e.detail)
  },

  onError(e) {
    console.error('WebView error:', e.detail)
    wx.showToast({
      title: '页面加载失败',
      icon: 'none'
    })
  }
})
