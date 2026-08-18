// pages/questionnaire/anonymous/list.js
const app = getApp()

Page({
  data: {
    questionnaires: [],
    loading: true
  },

  onLoad() {
    this.fetchAnonymousQuestionnaires()
  },

  /**
   * 获取可用的匿名问卷列表
   */
  async fetchAnonymousQuestionnaires() {
    try {
      this.setData({ loading: true })
      
      const res = await wx.request({
        url: `${app.globalData.apiBase}/public/questionnaires/available`,
        method: 'GET'
      })
      
      if (res.data.code === 0) {
        this.setData({
          questionnaires: res.data.data || [],
          loading: false
        })
      } else {
        throw new Error(res.data.message || '获取问卷失败')
      }
      
    } catch (err) {
      console.error('获取匿名问卷失败', err)
      wx.showToast({
        title: '获取问卷失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  /**
   * 开始问卷测评
   */
  async startQuestionnaire(e) {
    const { token } = e.currentTarget.dataset
    
    try {
      wx.showLoading({ title: '加载中...', mask: true })
      
      // POW 验证（防止机器人）
      const powChallenge = await this.getPowChallenge()
      const powProof = await this.solvePow(powChallenge)
      
      // 访问问卷
      const res = await wx.request({
        url: `${app.globalData.apiBase}/public/questionnaires/${token}`,
        method: 'POST',
        data: {
          challenge: powChallenge.challenge,
          proof: powProof,
          difficulty: powChallenge.difficulty
        }
      })
      
      wx.hideLoading()
      
      if (res.data.code === 0) {
        const { sessionId } = res.data.data
        
        // 保存 sessionId
        wx.setStorageSync(`questionnaire_session_${token}`, sessionId)
        
        // 跳转到测评页面
        wx.navigateTo({
          url: `/pages/questionnaire/assessment/index?token=${token}&sessionId=${sessionId}`
        })
      } else {
        throw new Error(res.data.message || '访问失败')
      }
      
    } catch (err) {
      wx.hideLoading()
      console.error('开始问卷失败', err)
      wx.showToast({
        title: err.message || '访问失败',
        icon: 'none'
      })
    }
  },

  /**
   * 获取 POW 挑战
   */
  async getPowChallenge() {
    const res = await wx.request({
      url: `${app.globalData.apiBase}/public/pow/challenge`,
      method: 'GET'
    })
    
    if (res.data.code === 0) {
      return res.data.data
    } else {
      throw new Error('获取验证失败')
    }
  },

  /**
   * 计算 POW（简化版，性能有限）
   */
  async solvePow(challenge) {
    const { challenge: challengeStr, difficulty } = challenge
    const target = '0'.repeat(difficulty)
    
    // 由于小程序性能限制，限制最大迭代次数
    for (let nonce = 0; nonce < 100000; nonce++) {
      const hash = await this.sha256(`${challengeStr}${nonce}`)
      if (hash.startsWith(target)) {
        console.log(`[POW] 找到解: nonce=${nonce}`)
        return nonce.toString()
      }
    }
    
    throw new Error('POW 计算超时')
  },

  /**
   * SHA256 哈希（小程序环境）
   */
  sha256(message) {
    return new Promise((resolve, reject) => {
      // 使用小程序加密API
      const hash = wx.getStorageSync('temp_hash') || ''
      // 这里简化处理，实际应该调用云函数计算
      // 由于小程序限制，这里返回一个简单的hash
      resolve(this.simpleHash(message))
    })
  },

  /**
   * 简单哈希函数（仅用于演示）
   */
  simpleHash(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(64, '0')
  },

  onShareAppMessage() {
    return {
      title: '匿名问卷测评',
      path: '/pages/questionnaire/anonymous/list'
    }
  }
})
