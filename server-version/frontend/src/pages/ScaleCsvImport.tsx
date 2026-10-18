import { useEffect, useRef, useState } from 'react'
import apiClient from '../api/client'

type ImportPreview = {
  digest: string; previewToken: string; previewExpiresAt: number; expectedUpdatedAt: string; count: number; totalItems: number; responseSetKey: string
  responseSet: { options: Array<{ value: string | number; label: string; score: number }> }
  scores: Array<{ key: string; label: string; aggregation: string }>
  items: Array<{ itemCode: string; content: string; reverse: boolean; scoreKeys: string[] }>
}
export default function ScaleCsvImport({ id, revision, disabled, onImported, onBusy, onFailure }: {
  id: string; revision?: string; disabled: boolean; onImported: (value: any) => void; onBusy: (value: boolean) => void; onFailure?: (error: unknown) => Promise<void>
}) {
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const mounted = useRef(true), pending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusy(false) } }, [onBusy])
  useEffect(() => { setPreview(null) }, [revision])
  const run = async (confirm: boolean) => {
    if (pending.current || disabled || !revision || (confirm && !preview)) return
    pending.current = true; setBusy(true); onBusy(true); setMessage(''); setFailed(false)
    try {
      const response = await apiClient.post<any>(`/scales/${id}/import/${confirm ? 'confirm' : 'preview'}`, {
        content, expectedUpdatedAt: confirm ? preview!.expectedUpdatedAt : revision,
        ...(confirm ? { digest: preview!.digest, previewToken: preview!.previewToken, previewExpiresAt: preview!.previewExpiresAt } : {}),
      })
      if (!mounted.current) return
      if (response.code !== 0) throw new Error(response.message || '导入失败')
      if (confirm) {
        onImported(response.data); setPreview(null)
        setMessage(`已导入并保存 ${response.data.importedCount} 道题。发布前请再次校验。`)
      } else { setPreview(response.data); setMessage('预检通过，凭据有效期 10 分钟。请核对题目、计分项和共享选项后确认保存。') }
    } catch (error) {
      if (!mounted.current) return
      setPreview(null); setFailed(true)
      setMessage((error as Error).message || '导入失败，输入已保留，请重新预检。')
      await onFailure?.(error)
    } finally {
      pending.current = false
      if (mounted.current) { setBusy(false); onBusy(false) }
    }
  }
  return <section className="border rounded-lg p-4 my-4 space-y-3" aria-label="CSV 批量导入">
    <h3 className="font-semibold">CSV 批量导入</h3>
    <p className="text-sm">仅向已保存的自定义草稿追加题目，使用一套共享 responseSet 和现有计分项。先保存共享选项、至少一题及计分定义；多响应集、标准量表不支持导入。最多共 200 题，CSV 不超过 200000 字节。</p>
    <p className="text-sm">表头：item_code,prompt,reverse,score_keys,response_set_key。reverse 明确填 true/false；多个计分项用 | 分隔。分值沿用共享选项，CSV 不声明新分值或新计分模型。</p>
    {disabled && !busy && <p role="status">请先保存当前编辑内容，再进行导入。</p>}
    <label className="block">CSV 内容<textarea className="input w-full min-h-32" aria-label="CSV 内容" value={content} maxLength={200000} disabled={busy || disabled}
      onChange={event => { setContent(event.target.value); setPreview(null); setMessage('') }} /></label>
    <button type="button" className="hui-button hui-button--secondary" disabled={busy || disabled || !content || !revision} onClick={() => void run(false)}>预检导入</button>
    {message && <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>}
    {preview && <div className="space-y-2">
      <p>新增 {preview.count} 题，保存后共 {preview.totalItems} 题。共享响应集：{preview.responseSetKey}</p>
      <ul>{preview.responseSet.options.map(option => <li key={String(option.value)}>{String(option.value)}：{option.label}，分值 {option.score}</li>)}</ul>
      <ul>{preview.scores.map(score => <li key={score.key}>{score.key}：{score.label}（{score.aggregation}）</li>)}</ul>
      <ol>{preview.items.map(item => <li key={item.itemCode}>{item.itemCode}：{item.content}；{item.reverse ? '反向计分' : '正向计分'}；计分项：{item.scoreKeys.join('、')}</li>)}</ol>
      <button type="button" className="hui-button hui-button--primary" disabled={busy || disabled} onClick={() => void run(true)}>确认导入并保存</button>
    </div>}
  </section>
}
