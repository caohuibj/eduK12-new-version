import { useEffect, useRef, useState } from 'react'
import apiClient, { sessionFetch } from '../api/client'

type ImportPreview = {
  digest: string; expectedUpdatedAt: string; count: number; totalItems: number; responseSetKey: string
  reportConfigured?: boolean
  responseSet: { options: Array<{ value: string | number; label: string; score: number }> }
  scores: Array<{ key: string; label: string; aggregation: string }>
  items: Array<{ itemCode: string; content: string; reverse: boolean; scoreKeys: string[] }>
}
export default function ScaleCsvImport({ id, revision, disabled, onImported, onBusy, onFailure }: {
  id: string; revision?: string; disabled: boolean; onImported: (value: any) => void; onBusy: (value: boolean) => void; onFailure?: (error: unknown) => Promise<void>
}) {
  const [mode, setMode] = useState<'xlsx' | 'csv'>('csv')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const mounted = useRef(true), pending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusy(false) } }, [onBusy])
  useEffect(() => { setPreview(null) }, [revision])
  const downloadTemplate = async () => {
    if (pending.current || busy) return
    pending.current = true; setBusy(true); onBusy(true); setMessage(''); setFailed(false)
    try {
      const res = await sessionFetch('/api/scales/import/full-template')
      if (!res.ok) throw new Error('模板下载失败，请刷新后重试')
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = 'scale-full-import-v1.xlsx'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      if (!mounted.current) return
      setFailed(true)
      setMessage((error as Error).message || '模板下载失败')
    } finally {
      pending.current = false
      if (mounted.current) { setBusy(false); onBusy(false) }
    }
  }
  const runWorkbook = async (confirm: boolean) => {
    if (pending.current || disabled || !revision || !file || (confirm && !preview)) return
    pending.current = true; setBusy(true); onBusy(true); setMessage(''); setFailed(false)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('expectedUpdatedAt', confirm ? preview!.expectedUpdatedAt : revision)
      if (confirm) {
        form.append('digest', preview!.digest)
      }
      const res = await sessionFetch(`/api/scales/${id}/import/full-${confirm ? 'confirm' : 'preview'}`, {
        method: 'POST',
        body: form,
      })
      const envelope = await res.json() as { code: number; data?: any; message?: string }
      if (!mounted.current) return
      if (!res.ok || envelope.code !== 0) throw new Error(envelope.message || 'Excel 导入失败')
      if (confirm) {
        onImported(envelope.data); setPreview(null)
        setMessage(`已一步导入并保存 ${envelope.data.importedCount} 道题（${envelope.data.reportConfigured ? '已配置阈值报告' : '仅数据采集'}）。发布前请再次校验。`)
      } else {
        setPreview(envelope.data)
        setMessage('Excel 预检通过。请核对题目、选项、计分与阈值报告后确认保存。')
      }
    } catch (error) {
      if (!mounted.current) return
      setPreview(null); setFailed(true)
      setMessage((error as Error).message || 'Excel 导入失败，文件已保留，请修正后重新预检。')
      await onFailure?.(error)
    } finally {
      pending.current = false
      if (mounted.current) { setBusy(false); onBusy(false) }
    }
  }
  const run = async (confirm: boolean) => {
    if (pending.current || disabled || !revision || (confirm && !preview)) return
    pending.current = true; setBusy(true); onBusy(true); setMessage(''); setFailed(false)
    try {
      const response = await apiClient.post<any>(`/scales/${id}/import/${confirm ? 'confirm' : 'preview'}`, {
        content, expectedUpdatedAt: confirm ? preview!.expectedUpdatedAt : revision,
        ...(confirm ? { digest: preview!.digest } : {}),
      })
      if (!mounted.current) return
      if (response.code !== 0) throw new Error(response.message || '导入失败')
      if (confirm) {
        onImported(response.data); setPreview(null)
        setMessage(`已导入并保存 ${response.data.importedCount} 道题。发布前请再次校验。`)
      } else { setPreview(response.data); setMessage('预检通过。请核对题目、计分项和共享选项后确认保存。') }
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
  return <section className="border rounded-lg p-4 my-4 space-y-3" aria-label="批量导入题目与配置">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{mode === 'xlsx' ? 'Excel 一步整份导入' : 'CSV 批量导入'}</h3>
      <div className="flex gap-2" role="tablist" aria-label="导入方式">
        <button type="button" role="tab" aria-selected={mode === 'csv'} className={`hui-button ${mode === 'csv' ? 'hui-button--primary' : 'hui-button--secondary'}`} disabled={busy || disabled} onClick={() => { setMode('csv'); setPreview(null); setMessage(''); setFailed(false) }}>CSV 追加题目</button>
        <button type="button" role="tab" aria-selected={mode === 'xlsx'} className={`hui-button ${mode === 'xlsx' ? 'hui-button--primary' : 'hui-button--secondary'}`} disabled={busy || disabled} onClick={() => { setMode('xlsx'); setPreview(null); setMessage(''); setFailed(false) }}>Excel 整份模板 (.xlsx)</button>
      </div>
    </div>
    {disabled && !busy && <p role="status">请先保存当前编辑内容，再进行导入。</p>}
    {mode === 'xlsx' ? <>
      <p className="text-sm">下载 3 页签 Excel 模板（选项组、题目与计分、阈值报告），填写后上传即可一次性覆盖并保存当前草稿的选项、题目、计分维度及阈值报告（若「阈值报告」留空，则视为仅数据采集工具）。</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="hui-button hui-button--secondary" disabled={busy || disabled} onClick={() => void downloadTemplate()}>下载 Excel 模板</button>
        <label className="block text-sm">上传填写好的 .xlsx 文件<input type="file" accept=".xlsx" className="ml-2" disabled={busy || disabled} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(''); setFailed(false) }} /></label>
      </div>
      <button type="button" className="hui-button hui-button--secondary" disabled={busy || disabled || !file || !revision} onClick={() => void runWorkbook(false)}>预检 Excel</button>
    </> : <>
      <p className="text-sm">仅向已保存的自定义草稿追加题目，使用一套共享 responseSet 和现有计分项。先保存共享选项、至少一题及计分定义；多响应集、标准量表不支持导入。最多共 200 题，CSV 不超过 200000 字节。</p>
      <p className="text-sm">表头：item_code,prompt,reverse,score_keys,response_set_key。reverse 明确填 true/false；多个计分项用 | 分隔。分值沿用共享选项，CSV 不声明新分值或新计分模型。</p>
      <label className="block">CSV 内容<textarea className="input w-full min-h-32" aria-label="CSV 内容" value={content} maxLength={200000} disabled={busy || disabled}
        onChange={event => { setContent(event.target.value); setPreview(null); setMessage('') }} /></label>
      <button type="button" className="hui-button hui-button--secondary" disabled={busy || disabled || !content || !revision} onClick={() => void run(false)}>预检导入</button>
    </>}
    {message && <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>}
    {preview && <div className="space-y-2">
      <p>{mode === 'xlsx' ? `共 ${preview.totalItems} 题（${preview.reportConfigured ? '含阈值报告' : '未配置报告 · 仅数据采集'}）。共享响应集：${preview.responseSetKey}` : `新增 ${preview.count} 题，保存后共 ${preview.totalItems} 题。共享响应集：${preview.responseSetKey}`}</p>
      <ul>{preview.responseSet.options.map(option => <li key={String(option.value)}>{String(option.value)}：{option.label}，分值 {option.score}</li>)}</ul>
      <ul>{preview.scores.map(score => <li key={score.key}>{score.key}：{score.label}（{score.aggregation}）</li>)}</ul>
      <ol>{preview.items.map(item => <li key={item.itemCode}>{item.itemCode}：{item.content}；{item.reverse ? '反向计分' : '正向计分'}；计分项：{item.scoreKeys.join('、')}</li>)}</ol>
      <button type="button" className="hui-button hui-button--primary" disabled={busy || disabled} onClick={() => void (mode === 'xlsx' ? runWorkbook(true) : run(true))}>确认导入并保存</button>
    </div>}
  </section>
}
