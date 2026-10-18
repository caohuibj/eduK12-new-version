import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { sessionFetch } from '../../api/client'
import AssessmentImagePresentation from '../assessment-media/AssessmentImagePresentation'
import { useAssessmentImageAssets } from '../assessment-media/useAssessmentImageAssets'
import type { AssessmentImage, AssessmentStaticImageAssetIdentityV1 } from '../assessment-media/types'
import { useAuthorCursorList } from './useAuthorCursorList'

export type AuthorImageAsset = { asset: AssessmentStaticImageAssetIdentityV1; name: string | null; sizeBytes: number }
const base = '/api/situational/authoring'
const imageKey = (item: AuthorImageAsset) => item.asset.assetId
export const authorImageContentPath = (assetId: string, draftId?: string) => draftId
  ? `${base}/drafts/${encodeURIComponent(draftId)}/media/${encodeURIComponent(assetId)}/content`
  : `${base}/media/images/${encodeURIComponent(assetId)}/content`
export async function loadAuthorImage(assetId: string, draftId?: string): Promise<Blob> {
  const response = await sessionFetch(authorImageContentPath(assetId, draftId), { cache: 'no-store' })
  if (!response.ok) throw new Error('图片无权访问或暂不可用')
  return response.blob()
}
const reference = (item: AuthorImageAsset): AssessmentImage => ({
  asset: { assetId: item.asset.assetId, contentHash: item.asset.contentHash, mimeType: item.asset.mimeType },
  altText: item.name?.replace(/\.[^.]+$/, '').slice(0, 300) || '情境图片',
  rightsStatus: 'unknown', rightsNote: '',
})

/** The shared SJT editor owns the value; this product adapter owns private media access. */
export function OnlineImageField({ image, onChange, draftId, readOnly = false, onBusyChange }: {
  image?: AssessmentImage
  onChange: (image: AssessmentImage | undefined) => void
  draftId?: string
  readOnly?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const library = useAuthorCursorList<AuthorImageAsset>(open ? '/media/images' : null, imageKey, 30)
  const [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const uploadRequest = useRef<AbortController | null>(null)
  const mounted = useRef(true), libraryId = useId()
  const change = useRef(onChange); change.current = onChange
  const busyChange = useRef(onBusyChange); busyChange.current = onBusyChange
  const readOnlyNow = useRef(readOnly); readOnlyNow.current = readOnly
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; uploadRequest.current?.abort(); busyChange.current?.(false) }
  }, [])
  const items = useMemo(() => image ? [{ asset: image.asset, altText: image.altText, caption: image.caption }] : [], [image])
  // Newly selected assets have not yet been saved into a draft, so use the owner's library proxy.
  const previewDraftId = image?.asset.assetId === selectedAssetId ? undefined : draftId
  const loadImage = useCallback((assetId: string) => loadAuthorImage(assetId, previewDraftId), [previewDraftId])
  const assetItems = useMemo(() => image ? [{ asset: image.asset, altText: '' }] : [],
    [image?.asset.assetId, image?.asset.contentHash, image?.asset.mimeType])
  const visual = useAssessmentImageAssets(assetItems, loadImage)
  const choose = (item: AuthorImageAsset | undefined) => {
    if (readOnlyNow.current) return
    setSelectedAssetId(item?.asset.assetId ?? null)
    change.current(item ? reference(item) : undefined)
  }
  const upload = async (file: File) => {
    if (readOnlyNow.current || uploadRequest.current) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      setError('只允许不超过 2MB 的 PNG/JPEG/WebP 静态图片'); return
    }
    const controller = new AbortController(); uploadRequest.current = controller
    setUploading(true); busyChange.current?.(true); setError('')
    try {
      const body = new FormData(); body.append('image', file)
      const response = await sessionFetch(`${base}/media/images`, { method: 'POST', body, signal: controller.signal })
      const result = await response.json()
      if (!response.ok || result.code !== 0 || !result.data) throw new Error(result.message || '图片上传失败')
      if (controller.signal.aborted || !mounted.current) return
      const item = result.data as AuthorImageAsset
      library.prepend(item)
      choose(item)
    } catch (reason) {
      if (!controller.signal.aborted && mounted.current) setError(reason instanceof Error ? reason.message : '图片上传失败')
    } finally { uploadRequest.current = null; if (!controller.signal.aborted && mounted.current) { setUploading(false); busyChange.current?.(false) } }
  }
  return <fieldset className="border rounded-lg p-3 space-y-3">
    <legend className="text-sm font-semibold">情境图片（可选）</legend>
    <p className="text-xs text-slate-600">仅限作者私有素材库中的静态图片。发布前须核实图片版权与本次展示授权；不要上传含个人隐私的材料。</p>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {!readOnly && <>
      <label className="text-sm block">上传情境图片（不超过 2MB）
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading}
          className="block mt-1 max-w-full" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = '' }}/>
      </label>
      {uploading && <p role="status">正在上传图片…</p>}
      <button type="button" className="btn-secondary" disabled={uploading} aria-expanded={open} aria-controls={libraryId}
        onClick={() => {
          setOpen(!open); setError('')
        }}>{open ? '收起作者素材库' : '打开作者素材库'}</button>
      <div id={libraryId} hidden={!open} className="space-y-2">{open && <>
        {library.loading && <p role="status">正在读取作者素材库…</p>}
        {library.error && <><p role="alert" className="text-red-700 text-sm">{library.error}</p>
          <button type="button" className="btn-secondary" disabled={library.loading || uploading} onClick={() => void library.retry()}>重试读取素材库</button></>}
        <label className="text-sm block">从作者素材库选择
          <select className="input block w-full" value={image?.asset.assetId || ''} disabled={uploading || (!library.items.length && library.loading)}
            onChange={e => choose(library.items.find(x => x.asset.assetId === e.target.value))}>
            <option value="">不使用图片</option>
            {image && !library.items.some(x => x.asset.assetId === image.asset.assetId) && <option value={image.asset.assetId}>当前情境图片</option>}
            {library.items.map(item => <option key={item.asset.assetId} value={item.asset.assetId}>{item.name || item.asset.assetId} · {Math.round(item.sizeBytes / 1024)} KB</option>)}
          </select>
        </label>
        {library.nextCursor && <button type="button" className="btn-secondary" disabled={library.loading || uploading} onClick={() => void library.loadMore()}>加载更多素材</button>}
      </>}</div>
    </>}
    {image && <div className="space-y-2">
      <AssessmentImagePresentation items={items} state={visual} ariaLabel="情境图片预览"/>
      <label className="text-sm block">图片替代文字（必填）<input className="input block w-full" value={image.altText} maxLength={300} readOnly={readOnly}
        onChange={e => onChange({ ...image, altText: e.target.value })}/></label>
      <label className="text-sm block">图片说明（可选）<input className="input block w-full" value={image.caption || ''} maxLength={1000} readOnly={readOnly}
        onChange={e => onChange({ ...image, caption: e.target.value })}/></label>
      <label className="text-sm block">图片版权状态<select className="input block w-full" value={image.rightsStatus} disabled={readOnly}
        onChange={e => onChange({ ...image, rightsStatus: e.target.value as AssessmentImage['rightsStatus'] })}>
        <option value="unknown">未核实（不可发布）</option><option value="self_authored">作者原创</option><option value="authorized">已获本次展示授权</option>
      </select></label>
      <label className="text-sm block">图片版权／授权凭据说明（必填）<textarea className="input block w-full" value={image.rightsNote} maxLength={2000} readOnly={readOnly}
        onChange={e => onChange({ ...image, rightsNote: e.target.value })}/></label>
      {!readOnly && <button type="button" className="btn-secondary" disabled={uploading} onClick={() => choose(undefined)}>从此情境移除图片引用</button>}
    </div>}
  </fieldset>
}
