import { useEffect, useRef, useState } from 'react'
import { capabilityGovernanceMedia, previewGovernanceMedia, type GovernanceMediaContext, type GovernanceMediaItem, type GovernanceProduct } from '../../api/scaleLibraryGovernance'
/** Neutral media primitive: each product owns its surrounding presentation. */
export function ScaleLibraryMediaPreview({ product, context, item }: { product: GovernanceProduct; context: GovernanceMediaContext; item: GovernanceMediaItem }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const generation = useRef(0), objectUrl = useRef('')
  const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(item.mimeType), isVideo = item.mimeType.startsWith('video/')
  useEffect(() => { setUrl(''); setError(''); setBusy(false); return () => { generation.current++; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current) } }, [product, context.kind, context.id, context.releaseId, item.assetId, item.contentHash])
  const preview = async () => {
    const current = ++generation.current
    setBusy(true); setError('')
    try {
      if (isImage) {
        const blob = await previewGovernanceMedia(product, context, item.assetId)
        if (current !== generation.current) return
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) throw new Error('服务器未返回可显示的图片预览。')
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current)
      } else {
        const capability = await capabilityGovernanceMedia(product, context, item.assetId)
        if (current !== generation.current) return
        // Only server-issued, short-lived same-origin media routes are accepted.
        if (!capability.url.startsWith('/api/assets/') || capability.url.startsWith('//') || !Number.isFinite(Date.parse(capability.expiresAt))) throw new Error('附件播放授权响应无效。')
        setUrl(capability.url)
      }
    } catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : '附件预览失败') }
    finally { if (current === generation.current) setBusy(false) }
  }
  return <div><button type="button" disabled={busy} onClick={() => void preview()}>{busy ? '读取授权预览…' : isImage ? '预览附件图片' : isVideo ? '授权预览视频' : '读取附件预览'}</button>
    {url && (isImage ? <img src={url} alt={'审核附件 ' + item.assetId} className="max-w-full max-h-80 object-contain" /> : isVideo ? <><video src={url} controls preload="none" aria-label={'审核视频 ' + item.assetId} className="max-w-full max-h-80" onError={() => setError('播放授权可能已过期或附件不可用，请重新读取授权预览。')} /><p>播放链接短时有效；失效后请重新授权预览。</p></> : <a href={url} target="_blank" rel="noopener noreferrer">查看获授权附件</a>)}
    {error && <p role="alert">{error}</p>}
  </div>
}
