import { useEffect, useState } from 'react'
import { cognitiveApi } from './api'
import CognitiveProfessionalReport from './CognitiveProfessionalReport'
import { formatReportCompletedAt } from './report-record'

type Page = NonNullable<Awaited<ReturnType<typeof cognitiveApi.professionalReports>>['data']>
export default function CognitiveProfessionalReports({ assignmentId }: { assignmentId: string }) {
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<Page | null>(null)
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setPage(null); setError(''); setSelected(0)
    void cognitiveApi.professionalReports(assignmentId, offset).then(response => {
      if (cancelled) return
      if (response.code !== 0 || !response.data) setError(response.message || '专业报告不可读取')
      else setPage(response.data)
    }).catch(() => { if (!cancelled) setError('专业报告暂不可读取，请稍后重试。') })
    return () => { cancelled = true }
  }, [assignmentId, offset])
  if (error) return <p role="alert">{error}</p>
  if (!page) return <p role="status">正在读取冻结的专业报告…</p>
  const record = page.records[selected]
  return <section aria-label="后台专业报告" data-cognitive-report-reader><div className="staff-panel staff-panel--padded cognitive-professional-reader-controls" style={{ marginBottom: 20 }} data-report-screen-only>
    <h2>{page.assignmentTitle} · 专业报告阅读</h2><p>已完成 {page.total} 份记录；仅显示现有权限允许的冻结结果，不包含科研专用指标或原始作答。</p>
    {page.records.length > 0 && <label>选择本页记录 <select value={selected} onChange={event => setSelected(Number(event.target.value))}>{page.records.map((item, index) => <option value={index} key={item.reportId ?? item.label}>{item.label}{formatReportCompletedAt(item.finishedAt) ? ` · ${formatReportCompletedAt(item.finishedAt)}` : ''}</option>)}</select></label>}
    <div className="staff-inline-actions"><button type="button" className="hui-button hui-button--secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 10))}>上一页</button><button type="button" className="hui-button hui-button--secondary" disabled={page.nextOffset === null} onClick={() => setOffset(page.nextOffset!)}>下一页</button></div>
  </div>{record?.report ? <CognitiveProfessionalReport report={record.report} recordLabel={record.label} reportId={record.reportId} assignmentTitle={page.assignmentTitle} finishedAt={record.finishedAt} references={record.references} /> : <p role="status">{record?.unavailableReason || '本页没有可读取的个人报告。群体专用结果请使用原有群体流程。'}</p>}</section>
}
