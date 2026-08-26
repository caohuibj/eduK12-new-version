/**
 * 公共打卡页面（匿名打卡）
 * 学生通过令牌访问，无需登录即可打卡
 */

import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Spin, message, Card, Button, Result, Input, Upload, Image } from 'antd'
import { CheckCircleOutlined, UploadOutlined, CameraOutlined, VideoCameraOutlined, FileTextOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { sanitizeHtml } from '../../utils/sanitize'

interface CheckinData {
  id: string
  title: string
  description?: string
  content?: string
  images?: string[]
  videos?: any[]
  documents?: any[]
  endTime?: string
  createdAt: string
  allowViewOthers: boolean
}

const PublicCheckin: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checkin, setCheckin] = useState<CheckinData | null>(null)
  const [sessionId, setSessionId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  
  // 表单数据
  const [content, setContent] = useState('')
  const [imageList, setImageList] = useState<UploadFile[]>([])
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (token) {
      validateAndFetchCheckin()
    }
  }, [token])

  /**
   * 验证令牌并获取打卡信息
   */
  const validateAndFetchCheckin = async () => {
    try {
      setLoading(true)
      
      const response = await fetch(`/api/checkins/public/${token}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '访问失败')
      }

      const data = await response.json()
      
      // 处理图片格式：将对象数组转为字符串数组
      const checkinData = data.data.checkin
      if (checkinData.images && Array.isArray(checkinData.images)) {
        checkinData.images = checkinData.images.map((img: any) => {
          if (typeof img === 'string') return img
          if (img && img.url) return img.url
          return ''
        }).filter(Boolean)
      }
      
      // 处理视频格式：保持对象结构，统一格式
      if (checkinData.videos && Array.isArray(checkinData.videos)) {
        checkinData.videos = checkinData.videos.map((video: any) => {
          if (typeof video === 'string') {
            return { url: video }
          }
          return video
        })
      }
      
      // 处理文档格式：保持对象结构，统一格式
      if (checkinData.documents && Array.isArray(checkinData.documents)) {
        checkinData.documents = checkinData.documents.map((doc: any) => {
          if (typeof doc === 'string') {
            return { url: doc }
          }
          return doc
        })
      }
      
      setCheckin(checkinData)
      setSessionId(data.data.sessionId)
      
      // 保存会话信息
      localStorage.setItem(`checkin_session_${token}`, data.data.sessionId)
      
    } catch (err: any) {
      setError(err.message || '打卡访问失败')
      message.error(err.message || '打卡访问失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 上传图片
   */
  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`/api/checkins/public/${token}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('图片上传失败')
    }

    const data = await response.json()
    return data.data.url
  }

  /**
   * 提交打卡
   */
  const handleSubmit = async () => {
    try {
      setSubmitting(true)

      // 上传图片
      const uploadedImages: string[] = []
      for (const file of imageList) {
        if (file.originFileObj) {
          const url = await uploadImage(file.originFileObj)
          uploadedImages.push(url)
        }
      }

      // 提交打卡
      const response = await fetch(`/api/checkins/public/${token}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          images: uploadedImages,
          sessionId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '提交失败')
      }

      message.success('提交成功！')
      setSubmitted(true)
      
    } catch (err: any) {
      message.error(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <Spin size="large" />
          <div className="mt-4 text-gray-600">正在加载打卡信息...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <Result
          status="error"
          title="访问失败"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <Result
          status="success"
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="提交成功"
          subTitle="感谢您的参与！"
        />
      </div>
    )
  }

  // 检查是否已截止
  const isEnded = checkin?.endTime && new Date(checkin.endTime) < new Date()

  if (isEnded) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <Result
          status="warning"
          title="打卡已结束"
          subTitle={`截止时间：${new Date(checkin.endTime!).toLocaleString('zh-CN')}`}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-lg">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {checkin?.title}
            </h1>
            {checkin?.description && (
              <p className="text-gray-600 mb-6">{checkin.description}</p>
            )}
            {checkin?.endTime && (
              <div className="bg-yellow-50 p-4 rounded-lg mb-6">
                <p className="text-sm text-yellow-800">
                  📅 截止时间：{new Date(checkin.endTime).toLocaleString('zh-CN')}
                </p>
              </div>
            )}
          </div>

          {/* 打卡内容 */}
          {checkin?.content && (
            <div className="bg-gray-50 p-6 rounded-lg mb-8">
              <div 
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(checkin.content) }}
              />
            </div>
          )}

          {/* 打卡图片 */}
          {checkin?.images && checkin.images.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4">参考图片</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {checkin.images.map((img, index) => (
                  <div key={index} className="relative">
                    <Image
                      src={img}
                      alt={`参考图片 ${index + 1}`}
                      className="rounded-lg object-cover"
                      style={{ maxHeight: '200px', width: '100%' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 参考视频 */}
          {checkin?.videos && checkin.videos.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <VideoCameraOutlined className="mr-2" />
                参考视频
              </h3>
              <div className="space-y-3">
                {checkin.videos.map((video: any, index: number) => {
                  // 调试：打印视频数据
                  console.log(`视频 ${index + 1} 数据:`, video)
                  
                  // 构造视频URL - 多重fallback确保能播放
                  const videoUrl = typeof video === 'string' 
                    ? video 
                    : (video.url || video.processedUrl || video.originalUrl || (video.fileName && `/uploads/videos/${video.fileName}`) || '')
                  const videoTitle = video.title || `视频 ${index + 1}`
                  
                  console.log(`视频 ${index + 1} URL:`, videoUrl)
                  
                  // 如果没有视频URL，显示错误提示
                  if (!videoUrl) {
                    return (
                      <div key={index} className="border rounded-lg p-4 bg-red-50">
                        <p className="text-red-600 text-sm">视频 {index + 1}: URL无效，无法播放</p>
                      </div>
                    )
                  }
                  
                  return (
                    <div key={index} className="border rounded-lg overflow-hidden bg-gray-50">
                      <div className="p-3 flex items-center">
                        <VideoCameraOutlined className="text-blue-500 mr-2" />
                        <span className="text-sm font-medium">{videoTitle}</span>
                      </div>
                      <div 
                        onContextMenu={(e) => e.preventDefault()}
                        className="relative"
                      >
                        <video
                          src={videoUrl}
                          controls
                          controlsList="nodownload"
                          disablePictureInPicture
                          className="w-full max-h-80 bg-black"
                          preload="metadata"
                          onContextMenu={(e) => e.preventDefault()}
                          onError={(e) => {
                            console.error('视频加载失败:', videoUrl)
                            const target = e.target as HTMLVideoElement
                            target.poster = '/video-error.png'
                          }}
                        >
                          <source src={videoUrl} type="video/mp4" />
                          <source src={videoUrl} type="video/webm" />
                          您的浏览器不支持视频播放
                        </video>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 参考文档 */}
          {checkin?.documents && checkin.documents.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <FileTextOutlined className="mr-2" />
                参考文档
              </h3>
              <div className="space-y-2">
                {checkin.documents.map((doc: any, index: number) => {
                  const docUrl = typeof doc === 'string' ? doc : (doc.url || doc.cosUrl)
                  const docTitle = doc.title || doc.fileName || `文档 ${index + 1}`
                  const docSize = doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : ''
                  
                  return (
                    <div
                      key={index}
                      onClick={() => {
                        // 使用内嵌预览而非直接下载
                        window.open(docUrl, '_blank', 'noopener,noreferrer')
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-3">
                        <FileTextOutlined className="text-red-500 text-xl" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{docTitle}</div>
                          {docSize && <div className="text-xs text-gray-500">{docSize}</div>}
                        </div>
                      </div>
                      <span className="text-blue-600 text-sm">在线查看</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 提交表单 */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                打卡内容
              </label>
              <Input.TextArea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="请输入打卡内容..."
                maxLength={1000}
                showCount
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <CameraOutlined className="mr-2" />
                上传图片（可选）
              </label>
              <Upload
                listType="picture-card"
                fileList={imageList}
                onChange={({ fileList }) => setImageList(fileList)}
                beforeUpload={() => false}
                maxCount={9}
                accept="image/*"
              >
                {imageList.length < 9 && (
                  <div>
                    <UploadOutlined />
                    <div style={{ marginTop: 8 }}>上传</div>
                  </div>
                )}
              </Upload>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                ℹ️ 本次打卡采用匿名方式，您的提交将被记录但不会显示个人信息
              </p>
            </div>

            <Button
              type="primary"
              size="large"
              block
              onClick={handleSubmit}
              loading={submitting}
              disabled={!content && imageList.length === 0}
            >
              提交打卡
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default PublicCheckin
