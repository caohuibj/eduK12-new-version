// 生产环境使用域名，开发环境可改为服务器IP
const BASE_URL = 'https://eduk12.top'
// const BASE_URL = 'http://140.143.146.97:3001'  // 开发调试用

function request(options) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token')
    
    wx.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header
      },
      timeout: 30000,
      success(res) {
        if (res.statusCode === 401) {
          wx.removeStorageSync('token')
          wx.removeStorageSync('userInfo')
          wx.reLaunch({ url: '/pages/login/index' })
          reject({ code: 401, message: '登录已过期，请重新登录' })
          return
        }
        
        if (res.data.code === 0) {
          resolve(res.data)
        } else {
          wx.showToast({
            title: res.data.message || '请求失败',
            icon: 'none'
          })
          reject(res.data)
        }
      },
      fail(err) {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
        reject({ code: -1, message: '网络请求失败', error: err })
      }
    })
  })
}

function get(url, data) {
  return request({ url, method: 'GET', data })
}

function post(url, data) {
  return request({ url, method: 'POST', data })
}

function put(url, data) {
  return request({ url, method: 'PUT', data })
}

function patch(url, data) {
  return request({ url, method: 'PATCH', data })
}

function del(url, data) {
  return request({ url, method: 'DELETE', data })
}

module.exports = {
  request,
  get,
  post,
  put,
  patch,
  del,
  BASE_URL,
  getBaseUrl: () => BASE_URL
}
