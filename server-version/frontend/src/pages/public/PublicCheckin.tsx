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

type PublicAssetSource = string | {
  assetId?: string
  url?: string | null
  processedUrl?: string | null
  originalUrl?: string | null
  fileName?: string
  title?: string
  name?: string
  size?: number
  fileSize?: number
}

interface CheckinData {
  id: string
  title: string
  description?: string
  content?: string
  images?: PublicAssetSource[]
  videos?: PublicAssetSource[]
  documents?: PublicAssetSource[]
  endTime?: string
  createdAt: string
  allowViewOthers: boolean
}

const sourceUrl = (source: PublicAssetSource | undefined): string => {
  if (typeof source === 'string') return source
  return source?.url || source?.processedUrl || source?.originalUrl || (source?.fileName ? `/uploads/videos/${source.fileName}` : '')
}

const usePublicAssetUrl = (source: PublicAssetSource | undefined, token: string | undefined): string => {
  const directUrl = sourceUrl(source)
  const [resolvedUrl, setResolvedUrl] = useState(directUrl)

  useEffect(() => {
    let disposed = false
    let objectUrl = ''

    if (!directUrl || !directUrl.startsWith('/api/public/assets/')) {
      setResolvedUrl(directUrl)
      return () => undefined
    }

    setResolvedUrl('')
    fetch(directUrl, { headers: { 'X-Checkin-Token': token || '' } })
      .then((response) => {
        if (!response.ok) throw new Error('asset unavailable')
        return response.blob()
      })
      .then((blob) => {
        if (disposed) return
        objectUrl = URL.createObjectURL(blob)
        setResolvedUrl(objectUrl)
      })
      .catch(() => {
        if (!disposed) setResolvedUrl('')
      })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [directUrl, token])

  return resolvedUrl
}

const PublicAssetImage: React.FC<{ source: PublicAssetSource; token?: string; alt: string }> = ({ source, token, alt }) => {
  const url = usePublicAssetUrl(source, token)
  return url ? (
    <Image
      src={url}
      alt={alt}
      className="rounded-lg object-cover"
      style={{ maxHeight: '200px', width: '100%' }}
    />
  ) : <div className="h-32 rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500">图片暂不可用</div>
}

const PublicAssetVideo: React.FC<{ source: PublicAssetSource; token?: string; title: string }> = ({ source, token, title }) => {
  const url = usePublicAssetUrl(source, token)
  if (!url) return <div className="border rounded-lg p-4 bg-red-50 text-red-600 text-sm">{title}：视频暂不可用</div>

  return (
    <div className="border rounded-lg overflow-hidden bg-gray-50">
      <div className="p-3 flex items-center">
        <VideoCameraOutlined className="text-blue-500 mr-2" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div onContextMenu={(e) => e.preventDefault()} className="relative">
        <video
          src={url}
          controls
          controlsList="nodownload"
          disablePictureInPicture
          className="w-full max-h-80 bg-black"
          preload="metadata"
          onContextMenu={(e) => e.preventDefault()}
          poster="/video-error.png"
        >
          您的浏览器不支持视频播放
        </video>
      </div>
    </div>
  )
}

const PublicAssetDocument: React.FC<{ source: PublicAssetSource; token?: string; title: string; size?: string }> = ({ source, token, title, size }) => {
  const url = usePublicAssetUrl(source, token)
  return (
    <div
      onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${url ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-60'}`}
    >
      <div className="flex items-center space-x-3">
        <FileTextOutlined className="text-red-500 text-xl" />
        <div>
          <div className="text-sm font-medium text-gray-900">{title}</div>
          {size && <div className="text-xs text-gray-500">{size}</div>}
        </div>
      </div>
      <span className="text-blue-600 text-sm">{url ? '在线查看' : '暂不可用'}</span>
    </div>
  )
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
      
      const checkinData = data.data.checkin as CheckinData
      
      setCheckin(checkinData)
      setSessionId(data.data.sessionId)
      
      // 会话标识只用于本次浏览器会话，不能长期留在 localStorage。
      sessionStorage.setItem(`checkin_session_${token}`, data.data.sessionId)
      
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
  const uploadImage = async (file: File): Promise<{ assetId: string }> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`/api/checkins/public/${token}/upload`, {
      method: 'POST',
      headers: {
        'X-Checkin-Token': token || '',
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error('图片上传失败')
    }

    const data = await response.json()
    return { assetId: data.data.assetId }
  }

  /**
   * 提交打卡
   */
  const handleSubmit = async () => {
    try {
      setSubmitting(true)

      // 上传图片
      const uploadedImages: Array<{ assetId: string }> = []
      for (const file of imageList) {
        if (file.originFileObj) {
          uploadedImages.push(await uploadImage(file.originFileObj))
        }
      }

      // 提交打卡
      const response = await fetch(`/api/checkins/public/${token}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Checkin-Token': token || '',
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
                    <PublicAssetImage source={img} token={token} alt={`参考图片 ${index + 1}`} />
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
                {checkin.videos.map((video, index) => {
                  const videoTitle = typeof video === 'string' ? `视频 ${index + 1}` : (video.title || `视频 ${index + 1}`)
                  return (
                    <PublicAssetVideo key={index} source={video} token={token} title={videoTitle} />
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
                {checkin.documents.map((doc, index) => {
                  const docTitle = typeof doc === 'string' ? `文档 ${index + 1}` : (doc.title || doc.fileName || `文档 ${index + 1}`)
                  const docBytes = typeof doc === 'string' ? undefined : (doc.size || doc.fileSize)
                  const docSize = docBytes ? `${(docBytes / 1024).toFixed(1)} KB` : ''
                  return (
                    <PublicAssetDocument key={index} source={doc} token={token} title={docTitle} size={docSize} />
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
