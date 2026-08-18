/**
 * 文档相关API
 */
import request from '../utils/request'

/**
 * 获取文档列表
 */
export function getDocumentList(params) {
  return request({
    url: '/documents',
    method: 'GET',
    data: params
  })
}

/**
 * 获取文档详情
 */
export function getDocumentDetail(id) {
  return request({
    url: `/documents/${id}`,
    method: 'GET'
  })
}

/**
 * 预览文档（小程序专用）
 * @param {string} url - 文档URL
 * @param {boolean} allowDownload - 是否允许下载
 */
export function previewDocument(url, allowDownload = false) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('文档URL为空'))
      return
    }

    console.log('[文档预览] URL:', url, '允许下载:', allowDownload)
    
    wx.showLoading({ title: '加载文档中...' })
    
    // 先下载文件到本地
    wx.downloadFile({
      url: url,
      success: (res) => {
        if (res.statusCode === 200) {
          console.log('[文档预览] 下载成功，临时路径:', res.tempFilePath)
          
          // 打开文档预览
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: allowDownload, // false时不显示右上角菜单，禁止转发下载
            success: () => {
              console.log('[文档预览] 打开成功')
              wx.hideLoading()
              resolve()
            },
            fail: (err) => {
              console.error('[文档预览] 打开失败:', err)
              wx.hideLoading()
              
              // 如果打开失败，提示用户
              wx.showModal({
                title: '提示',
                content: '无法打开文档，请检查网络连接或稍后重试',
                showCancel: false
              })
              reject(err)
            }
          })
        } else {
          wx.hideLoading()
          console.error('[文档预览] 下载失败，状态码:', res.statusCode)
          wx.showToast({
            title: '文档加载失败',
            icon: 'none'
          })
          reject(new Error('下载文件失败'))
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('[文档预览] 下载失败:', err)
        wx.showToast({
          title: '文档下载失败',
          icon: 'none',
          duration: 2000
        })
        reject(err)
      }
    })
  })
}

export default {
  getDocumentList,
  getDocumentDetail,
  previewDocument
}
