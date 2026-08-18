function set(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error('storage set error:', e)
    return false
  }
}

function get(key) {
  try {
    return wx.getStorageSync(key)
  } catch (e) {
    console.error('storage get error:', e)
    return null
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (e) {
    console.error('storage remove error:', e)
    return false
  }
}

function clear() {
  try {
    wx.clearStorageSync()
    return true
  } catch (e) {
    console.error('storage clear error:', e)
    return false
  }
}

module.exports = {
  set,
  get,
  remove,
  clear
}
