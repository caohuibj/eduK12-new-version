import { useEffect, useRef, useState } from 'react'
import apiClient, { ensureCsrfToken, sessionAxios } from '../api/client'
import type { RawScoreFeedbackImage } from '../modules/scale/rawScoreFeedback'

type Uploaded = { assetId: string; contentHash: string; mimeType: RawScoreFeedbackImage['asset']['mimeType'] }
/** Training-owned upload UI. Persist immutable identity, never a user-supplied URL. */
export function TrainingFeedbackImageField({ images = [], disabled, onChange, onBusy }: {
  images?: RawScoreFeedbackImage[]; disabled: boolean; onChange: (images: RawScoreFeedbackImage[]) => void; onBusy?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const latest = useRef({ disabled, onChange, images })
  latest.current = { disabled, onChange, images }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const upload = async (file: File) => {
    if (disabled || busy) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      setError('请选择不超过 2MB 的 PNG、JPEG 或 WebP 静态图片'); return
    }
    setBusy(true); setError(''); onBusy?.(true)
    try {
      const csrf = await ensureCsrfToken()
      if (!csrf) throw new Error('无法确认安全会话，请重新登录后上传')
      const body = new FormData(); body.append('image', file)
      const response = await sessionAxios.post('/uploads/image', body, { headers: { 'X-CSRF-Token': csrf } })
      const asset = response.data.data as Uploaded | undefined
      if (response.data.code !== 0 || !asset?.assetId || !asset.contentHash || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) throw new Error('未获得可冻结的图片身份，请重新选择')
      if (mounted.current && !latest.current.disabled) latest.current.onChange([...latest.current.images, {
        asset: { assetId: asset.assetId, contentHash: asset.contentHash, mimeType: asset.mimeType },
        altText: file.name.replace(/\.[^.]+$/, '') || '反馈图片', order: latest.current.images.length,
      }])
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : '图片上传失败') }
    finally { onBusy?.(false); if (mounted.current) setBusy(false) }
  }
  return <fieldset className="scale-feedback-images" disabled={disabled || busy}>
    <legend>反馈图片（可选）</legend>
    <p>仅上传有权使用的静态图片；保存文件身份，不接受外链。图片随发布版本固定。</p>
    {images.map((image, index) => <div className="scale-feedback-image" key={`${image.asset.assetId}-${index}`}>
      <TrainingFeedbackImagePreview image={image} />
      <label>图片说明<input className="input" value={image.altText} onChange={event => onChange(images.map((entry, i) => i === index ? { ...entry, altText: event.target.value } : entry))} /></label>
      <button type="button" className="hui-button hui-button--secondary" onClick={() => onChange(images.filter((_, i) => i !== index).map((entry, order) => ({ ...entry, order })))}>移除图片</button>
    </div>)}
    <label className="scale-feedback-upload">{busy ? '正在上传…' : '上传反馈图片'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} /></label>
    {error && <p role="alert">{error}</p>}
  </fieldset>
}

export function TrainingFeedbackImagePreview({ image }: { image: RawScoreFeedbackImage }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setUrl(null)
    void apiClient.get<{ url: string }>(`/assets/${encodeURIComponent(image.asset.assetId)}/url`).then(result => {
      if (active && result.code === 0 && result.data?.url) setUrl(result.data.url)
    }).catch(() => { /* An unavailable preview does not discard the frozen identity. */ })
    return () => { active = false }
  }, [image.asset.assetId])
  return url ? <img src={url} alt={image.altText} className="scale-feedback-thumbnail" /> : <span>图片已选择：{image.altText}</span>
}
