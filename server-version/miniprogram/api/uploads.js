const { BASE_URL } = require('../utils/request')
const { getToken } = require('../utils/auth')
const { get } = require('../utils/request')

function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    const token = getToken()
    
    wx.uploadFile({
      url: BASE_URL + '/api/uploads/image',
      filePath: filePath,
      name: 'image',
      header: {
        'Authorization': `Bearer ${token}`
      },
      success(res) {
        const data = JSON.parse(res.data)
        if (data.code === 0) {
          resolve(data)
        } else {
          reject(data)
        }
      },
      fail(err) {
        reject({ code: -1, message: '上传失败', error: err })
      }
    })
  })
}

/**
 * 轮询等待图片处理完成
 * @param {string} imageId - 图片ID
 * @param {number} maxRetries - 最大重试次数
 * @param {number} interval - 轮询间隔(ms)
 */
function pollImageStatus(imageId, maxRetries = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0
    
    const poll = async () => {
      try {
        const res = await get(`/api/uploads/image/status/${imageId}`)
        const status = res.data?.status
        
        if (status === 'completed') {
          resolve(res.data)
        } else if (status === 'failed') {
          reject(new Error(res.data?.error || '图片处理失败'))
        } else if (retries >= maxRetries) {
          reject(new Error('图片处理超时'))
        } else {
          retries++
          setTimeout(poll, interval)
        }
      } catch (error) {
        if (retries >= maxRetries) {
          reject(error)
        } else {
          retries++
          setTimeout(poll, interval)
        }
      }
    }
    
    poll()
  })
}

/**
 * 上传图片并等待处理完成
 * @param {string} filePath - 本地文件路径
 */
async function uploadImageAndWait(filePath) {
  // 1. 上传图片
  const uploadRes = await uploadImage(filePath)
  const imageId = uploadRes.data?.imageId
  
  if (!imageId) {
    throw new Error('上传返回的 imageId 为空')
  }
  
  // 2. 轮询等待处理完成
  const statusRes = await pollImageStatus(imageId)
  
  return {
    url: statusRes.url,
    filename: statusRes.filename,
    size: statusRes.size
  }
}

module.exports = {
  uploadImage,
  uploadImageAndWait,
  pollImageStatus
}
