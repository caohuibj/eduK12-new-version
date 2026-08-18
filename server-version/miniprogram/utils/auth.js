function getToken() {
  return wx.getStorageSync('token') || ''
}

function setToken(token) {
  wx.setStorageSync('token', token)
}

function removeToken() {
  wx.removeStorageSync('token')
}

function getUserInfo() {
  return wx.getStorageSync('userInfo') || null
}

function setUserInfo(userInfo) {
  wx.setStorageSync('userInfo', userInfo)
}

function removeUserInfo() {
  wx.removeStorageSync('userInfo')
}

function isLoggedIn() {
  return !!getToken()
}

function logout() {
  removeToken()
  removeUserInfo()
  wx.reLaunch({ url: '/pages/login/index' })
}

module.exports = {
  getToken,
  setToken,
  removeToken,
  getUserInfo,
  setUserInfo,
  removeUserInfo,
  isLoggedIn,
  logout
}
