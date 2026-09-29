/**
 * 公共打卡页面（匿名打卡）
 * 学生通过令牌访问，无需登录即可打卡
 */

import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Image, Upload } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { Camera, FileText, Upload as UploadIcon, Video } from 'lucide-react'
import { sanitizeHtml } from '../../utils/sanitize'
import { isSafeExternalMediaUrl } from '../../utils/mediaUtils'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

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
    <Image src={url} alt={alt} className="hui-public-checkin__image" preview={{ mask: '查看大图' }} />
  ) : (
    <div className="hui-public-checkin__asset-unavailable">图片暂不可用</div>
  )
}

const PublicAssetVideo: React.FC<{ source: PublicAssetSource; token?: string; title: string }> = ({ source, token, title }) => {
  const url = usePublicAssetUrl(source, token)
  if (!url) return <div className="hui-public-checkin__asset-error">{title}：视频暂不可用</div>

  return (
    <div className="hui-public-checkin__video">
      <div className="hui-public-checkin__asset-heading">
        <Video size={17} aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div onContextMenu={event => event.preventDefault()}>
        <video
          src={url}
          controls
          controlsList="nodownload"
          disablePictureInPicture
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
    <div className="hui-public-checkin__document-copy">
      <FileText size={20} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {size && <small>{size}</small>}
      </div>
    </div>
    <span>{available ? '在线查看' : '暂不可用'}</span>
  </>
)

const PublicAssetDocument: React.FC<{ source: PublicAssetSource; token?: string; title: string; size?: string }> = ({ source, token, title, size }) => {
  const url = usePublicAssetUrl(source, token)
  if (!url) {
    return (
      <div className="hui-public-checkin__document hui-public-checkin__document--disabled" aria-disabled="true">
        <DocumentBody title={title} size={size} available={false} />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      onContextMenu={event => event.preventDefault()}
      className="hui-public-checkin__document"
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
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '打卡访问失败')
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

      setSubmitted(true)
    } catch (operationError) {
      setSubmitError(operationError instanceof Error ? operationError.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ProductPage width="reading" className="hui-public-participation hui-public-participation--centered">
        <ProductStatus kind="pending" title="正在加载打卡信息" announce="polite">
          正在确认匿名入口与本次打卡会话。
        </ProductStatus>
      </ProductPage>
    )
  }

  if (error) {
    return (
      <ProductPage width="reading" className="hui-public-participation hui-public-participation--centered">
        <ProductStatus
          kind="error"
          title="访问失败"
          announce="assertive"
          actions={<ProductButton variant="primary" onClick={() => void validateAndFetchCheckin()}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      </ProductPage>
    )
  }

  if (submitted) {
    return (
      <ProductPage width="reading" className="hui-public-participation hui-public-participation--centered">
        <ProductStatus kind="success" title="提交成功" announce="polite">
          感谢您的参与。
        </ProductStatus>
      </ProductPage>
    )
  }

  const isEnded = checkin?.endTime && new Date(checkin.endTime) < new Date()
  if (isEnded) {
    return (
      <ProductPage width="reading" className="hui-public-participation hui-public-participation--centered">
        <ProductStatus kind="warning" title="打卡已结束">
          截止时间：{new Date(checkin.endTime!).toLocaleString('zh-CN')}
        </ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="reading" className="hui-public-participation hui-public-checkin">
      <PageHeader title={checkin?.title || '匿名打卡'} description={checkin?.description || '请根据页面说明完成本次打卡。'} />

      {checkin?.endTime && (
        <ProductStatus kind="warning" title="截止时间">
          {new Date(checkin.endTime).toLocaleString('zh-CN')}
        </ProductStatus>
      )}

      {checkin?.content && (
        <section className="hui-public-checkin__content" aria-label="打卡说明">
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(checkin.content) }} />
        </section>
      )}

      {checkin?.images && checkin.images.length > 0 && (
        <section className="hui-public-checkin__section" aria-labelledby="public-checkin-images-title">
          <h2 id="public-checkin-images-title">参考图片</h2>
          <div className="hui-public-checkin__image-grid">
            {checkin.images.map((image, index) => (
              <PublicAssetImage key={index} source={image} token={token} alt={`参考图片 ${index + 1}`} />
            ))}
          </div>
        </section>
      )}

      {checkin?.videos && checkin.videos.length > 0 && (
        <section className="hui-public-checkin__section" aria-labelledby="public-checkin-videos-title">
          <h2 id="public-checkin-videos-title">参考视频</h2>
          <div className="hui-public-checkin__asset-list">
            {checkin.videos.map((video, index) => {
              const videoTitle = typeof video === 'string' ? `视频 ${index + 1}` : (video.title || `视频 ${index + 1}`)
              return <PublicAssetVideo key={index} source={video} token={token} title={videoTitle} />
            })}
          </div>
        </section>
      )}

      {checkin?.documents && checkin.documents.length > 0 && (
        <section className="hui-public-checkin__section" aria-labelledby="public-checkin-documents-title">
          <h2 id="public-checkin-documents-title">参考文档</h2>
          <div className="hui-public-checkin__asset-list">
            {checkin.documents.map((document, index) => {
              const documentTitle = typeof document === 'string' ? `文档 ${index + 1}` : (document.title || document.fileName || `文档 ${index + 1}`)
              const documentBytes = typeof document === 'string' ? undefined : (document.size || document.fileSize)
              const documentSize = documentBytes ? `${(documentBytes / 1024).toFixed(1)} KB` : ''
              return <PublicAssetDocument key={index} source={document} token={token} title={documentTitle} size={documentSize} />
            })}
          </div>
        </section>
      )}

      <section className="hui-public-checkin__response" aria-labelledby="public-checkin-response-title">
        <h2 id="public-checkin-response-title">提交打卡</h2>

        <label htmlFor="public-checkin-content" className="hui-public-checkin__field">
          <span>打卡内容</span>
          <textarea
            id="public-checkin-content"
            rows={5}
            value={content}
            onChange={event => setContent(event.target.value)}
            placeholder="请输入打卡内容..."
            maxLength={1000}
          />
          <small>{content.length} / 1000</small>
        </label>

        <div className="hui-public-checkin__field">
          <div id="public-checkin-upload-label" className="hui-public-checkin__field-label">
            <Camera size={17} aria-hidden="true" />
            上传图片（可选）
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
              <div className="hui-public-checkin__upload-trigger">
                <UploadIcon size={18} aria-hidden="true" />
                <span>上传</span>
              </div>
            )}
          </Upload>
        </div>

        <ProductStatus kind="info" title="匿名提交">
          本次打卡采用匿名方式，您的提交将被记录，但不会在该公共页面显示个人身份信息。
        </ProductStatus>

        {submitError && (
          <ProductStatus kind="error" title="提交失败" announce="assertive">
            {submitError}
          </ProductStatus>
        )}

        <ProductButton
          variant="primary"
          className="hui-public-checkin__submit"
          onClick={() => void handleSubmit()}
          disabled={submitting || (!content && imageList.length === 0)}
        >
          {submitting ? '提交中…' : '提交打卡'}
        </ProductButton>
      </section>
    </ProductPage>
  )
}

export default PublicCheckin
