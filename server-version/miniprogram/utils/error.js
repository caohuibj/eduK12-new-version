function handleError(error, context = '') {
  console.error(`[${context}]`, error)
  
  let message = '操作失败，请稍后重试'
  
  if (error.errMsg) {
    if (error.errMsg.includes('timeout')) {
      message = '网络超时，请检查网络连接'
    } else if (error.errMsg.includes('fail')) {
      message = '网络请求失败'
    }
  }
  
  if (error.code) {
    switch (error.code) {
      case 401:
        message = '登录已过期，请重新登录'
        wx.reLaunch({ url: '/pages/login/index' })
        break
      case 403:
        message = '没有权限执行此操作'
        break
      case 404:
        message = '请求的资源不存在'
        break
      case 500:
        message = '服务器错误，请稍后重试'
        break
    }
  }
  
  if (error.message) {
    message = error.message
  }
  
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2000
  })
  
  return message
}

module.exports = {
  handleError
}
