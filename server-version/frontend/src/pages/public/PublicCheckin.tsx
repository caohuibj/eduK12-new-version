/**
 * 公共打卡页面（匿名打卡）
 * 学生通过令牌访问，无需登录即可打卡
 */

import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Image, Input, Result, Spin, Upload, message } from 'antd'
import { CameraOutlined, CheckCircleOutlined, FileTextOutlined, UploadOutlined, VideoCameraOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { sanitizeHtml } from '../../utils/sanitize'
import { isSafeExternalMediaUrl } from '../../utils/mediaUtils'

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

const containsControlCharacter = (value: string): boolean => [...value].some(character => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint < 0x20 || codePoint === 0x7f
})

const isSafeLegacyUploadReference = (value: string): boolean => {
  if (!/^\/?uploads\/[A-Za-z0-9._~!$&'()*+,;=@%/_-]+$/.test(value)) return false
  try {
    const decoded = decodeURIComponent(value)
    return /^\/?uploads\/[A-Za-z0-9._~!$&'()*+,;=@/_-]+$/.test(decoded)
      && !decoded.includes('\\')
      && !containsControlCharacter(decoded)
      && !decoded.split('/').some(segment => segment === '.' || segment === '..')
  } catch {
    return false
  }
}

const isSafeSignedPublicAssetUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/api/public/assets/')) return false
    return /^\/api\/public\/assets\/[A-Za-z0-9_-]{1,100}\/content$/.test(parsed.pathname)
      && /^\d+$/.test(parsed.searchParams.get('expires') || '')
      && /^[A-Za-z0-9_-]{40,100}$/.test(parsed.searchParams.get('signature') || '')
  } catch {
    return false
  }
}

const isSafePublicMediaUrl = (value: string): boolean => (
  isSafeSignedPublicAssetUrl(value)
  || isSafeLegacyUploadReference(value)
  || isSafeExternalMediaUrl(value)
)

const sourceUrl = (source: PublicAssetSource | undefined): string => {
  const candidates = typeof source === 'string'
    ? [source]
    : [source?.url, source?.processedUrl, source?.originalUrl, source?.fileName ? `/uploads/videos/${source.fileName}` : undefined]
  return candidates.find((candidate): candidate is string => Boolean(candidate && isSafePublicMediaUrl(candidate))) || ''
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
      .then(response => {
        if (!response.ok) throw new Error('asset unavailable')
        return response.blob()
      })
      .then(blob => {
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
    <Image src={url} alt={alt} className="rounded-lg object-cover" style={{ maxHeight: '200px', width: '100%' }} />
  ) : (
    <div className="flex h-32 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">图片暂不可用</div>
  )
}

const PublicAssetVideo: React.FC<{ source: PublicAssetSource; token?: string; title: string }> = ({ source, token, title }) => {
  const url = usePublicAssetUrl(source, token)
  if (!url) return <div className="rounded-lg border bg-red-50 p-4 text-sm text-red-600">{title}：视频暂不可用</div>

  return (
    <div className="overflow-hidden rounded-lg border bg-gray-50">
      <div className="flex items-center p-3">
        <VideoCameraOutlined className="mr-2 text-blue-500" aria-hidden="true" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div onContextMenu={event => event.preventDefault()} className="relative">
        <video
          src={url}
          controls
          controlsList="nodownload"
          disablePictureInPicture
          className="max-h-80 w-full bg-black"
          preload="metadata"
          onContextMenu={event => event.preventDefault()}
          poster="/video-error.png"
          aria-label={title}
        >
          您的浏览器不支持视频播放
        </video>
      </div>
    </div>
  )
}

const DocumentBody: React.FC<{ title: string; size?: string; available: boolean }> = ({ title, size, available }) => (
  <>
    <div className="flex items-center gap-3">
      <FileTextOutlined className="text-xl text-red-500" aria-hidden="true" />
      <div>
        <div className="text-sm font-medium text-gray-900">{title}</div>
        {size && <div className="text-xs text-gray-500">{size}</div>}
      </div>
    </div>
    <span className="text-sm text-blue-600">{available ? '在线查看' : '暂不可用'}</span>
  </>
)

const PublicAssetDocument: React.FC<{ source: PublicAssetSource; token?: string; title: string; size?: string }> = ({ source, token, title, size }) => {
  const url = usePublicAssetUrl(source, token)
  if (!url) {
    return (
      <div className="flex items-center justify-between rounded-lg border p-3 opacity-60" aria-disabled="true">
        <DocumentBody title={title} size={size} available={false} />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      onContextMenu={event => event.preventDefault()}
      className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-gray-50"
      aria-label={`在线查看 ${title}`}
    >
      <DocumentBody title={title} size={size} available />
    </button>
  )
}

const PublicCheckin: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checkin, setCheckin] = useState<CheckinData | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [sessionCapability, setSessionCapability] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [imageList, setImageList] = useState<UploadFile[]>([])
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (token) validateAndFetchCheckin()
  }, [token])

  const validateAndFetchCheckin = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/checkins/public/${token}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '访问失败')
      }

      const data = await response.json()
      setCheckin(data.data.checkin as CheckinData)
      setSessionId(data.data.sessionId)
      setSessionCapability(data.data.sessionCapability)
      sessionStorage.setItem(`checkin_session_${token}`, data.data.sessionId)
      sessionStorage.setItem(`checkin_session_capability_${token}`, data.data.sessionCapability)
    } catch (fetchError: any) {
      setError(fetchError.message || '打卡访问失败')
      message.error(fetchError.message || '打卡访问失败')
    } finally {
      setLoading(false)
    }
  }

  const uploadImage = async (file: File): Promise<{ assetId: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sessionId', sessionId)

    const response = await fetch(`/api/checkins/public/${token}/upload`, {
      method: 'POST',
      headers: {
        'X-Checkin-Token': token || '',
        'X-Checkin-Session-Capability': sessionCapability,
      },
      body: formData,
    })

    if (!response.ok) throw new Error('图片上传失败')
    const data = await response.json()
    return { assetId: data.data.assetId }
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setSubmitError(null)
      const uploadedImages: Array<{ assetId: string }> = []
      for (const file of imageList) {
        if (file.originFileObj) uploadedImages.push(await uploadImage(file.originFileObj))
      }

      const response = await fetch(`/api/checkins/public/${token}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Checkin-Token': token || '',
          'X-Checkin-Session-Capability': sessionCapability,
        },
        body: JSON.stringify({ content, images: uploadedImages, sessionId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '提交失败')
      }

      message.success('提交成功！')
      setSubmitted(true)
    } catch (operationError: any) {
      const text = operationError.message || '提交失败'
      setSubmitError(text)
      message.error(text)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        <div className="text-center">
          <Spin size="large" />
          <div className="mt-4 text-gray-600">正在加载打卡信息...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result
          status="error"
          title="访问失败"
          subTitle={error}
          extra={<Button type="primary" onClick={() => void validateAndFetchCheckin()}>重试</Button>}
        />
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result status="success" icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />} title="提交成功" subTitle="感谢您的参与！" />
      </div>
    )
  }

  const isEnded = checkin?.endTime && new Date(checkin.endTime) < new Date()
  if (isEnded) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Result status="warning" title="打卡已结束" subTitle={`截止时间：${new Date(checkin.endTime!).toLocaleString('zh-CN')}`} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <main className="mx-auto max-w-3xl">
        <Card className="shadow-lg">
          <header className="mb-8">
            <h1 className="mb-4 text-2xl font-bold text-gray-900 sm:text-3xl">{checkin?.title}</h1>
            {checkin?.description && <p className="mb-6 text-gray-600">{checkin.description}</p>}
            {checkin?.endTime && (
              <div className="mb-6 rounded-lg bg-yellow-50 p-4">
                <p className="text-sm text-yellow-800">📅 截止时间：{new Date(checkin.endTime).toLocaleString('zh-CN')}</p>
              </div>
            )}
          </header>

          {checkin?.content && (
            <div className="mb-8 rounded-lg bg-gray-50 p-4 sm:p-6">
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(checkin.content) }} />
            </div>
          )}

          {checkin?.images && checkin.images.length > 0 && (
            <section className="mb-8" aria-labelledby="public-checkin-images-title">
              <h2 id="public-checkin-images-title" className="mb-4 font-semibold text-gray-900">参考图片</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {checkin.images.map((image, index) => (
                  <div key={index} className="relative">
                    <PublicAssetImage source={image} token={token} alt={`参考图片 ${index + 1}`} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {checkin?.videos && checkin.videos.length > 0 && (
            <section className="mb-8" aria-labelledby="public-checkin-videos-title">
              <h2 id="public-checkin-videos-title" className="mb-4 flex items-center font-semibold text-gray-900">
                <VideoCameraOutlined className="mr-2" aria-hidden="true" />参考视频
              </h2>
              <div className="space-y-3">
                {checkin.videos.map((video, index) => {
                  const videoTitle = typeof video === 'string' ? `视频 ${index + 1}` : (video.title || `视频 ${index + 1}`)
                  return <PublicAssetVideo key={index} source={video} token={token} title={videoTitle} />
                })}
              </div>
            </section>
          )}

          {checkin?.documents && checkin.documents.length > 0 && (
            <section className="mb-8" aria-labelledby="public-checkin-documents-title">
              <h2 id="public-checkin-documents-title" className="mb-4 flex items-center font-semibold text-gray-900">
                <FileTextOutlined className="mr-2" aria-hidden="true" />参考文档
              </h2>
              <div className="space-y-2">
                {checkin.documents.map((document, index) => {
                  const documentTitle = typeof document === 'string' ? `文档 ${index + 1}` : (document.title || document.fileName || `文档 ${index + 1}`)
                  const documentBytes = typeof document === 'string' ? undefined : (document.size || document.fileSize)
                  const documentSize = documentBytes ? `${(documentBytes / 1024).toFixed(1)} KB` : ''
                  return <PublicAssetDocument key={index} source={document} token={token} title={documentTitle} size={documentSize} />
                })}
              </div>
            </section>
          )}

          <section className="space-y-6" aria-labelledby="public-checkin-response-title">
            <h2 id="public-checkin-response-title" className="sr-only">提交打卡</h2>
            <div>
              <label htmlFor="public-checkin-content" className="mb-2 block text-sm font-medium text-gray-700">打卡内容</label>
              <Input.TextArea
                id="public-checkin-content"
                rows={4}
                value={content}
                onChange={event => setContent(event.target.value)}
                placeholder="请输入打卡内容..."
                maxLength={1000}
                showCount
              />
            </div>

            <div>
              <div id="public-checkin-upload-label" className="mb-2 block text-sm font-medium text-gray-700">
                <CameraOutlined className="mr-2" aria-hidden="true" />上传图片（可选）
              </div>
              <Upload
                aria-labelledby="public-checkin-upload-label"
                listType="picture-card"
                fileList={imageList}
                onChange={({ fileList }) => setImageList(fileList)}
                beforeUpload={() => false}
                maxCount={9}
                accept="image/*"
              >
                {imageList.length < 9 && (
                  <div>
                    <UploadOutlined aria-hidden="true" />
                    <div style={{ marginTop: 8 }}>上传</div>
                  </div>
                )}
              </Upload>
            </div>

            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-blue-800">ℹ️ 本次打卡采用匿名方式，您的提交将被记录但不会显示个人信息</p>
            </div>

            {submitError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}

            <Button type="primary" size="large" block onClick={handleSubmit} loading={submitting} disabled={!content && imageList.length === 0}>
              提交打卡
            </Button>
          </section>
        </Card>
      </main>
    </div>
  )
}

export default PublicCheckin