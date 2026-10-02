import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { legacyArchiveApi, type ArchiveDetail, type ArchiveKind, type ArchiveRow } from '../../api/legacyArchive'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader } from '../../components/product-ui/PageHeader'
import { ProductPage } from '../../components/product-ui/ProductPage'

const statusLabel = (status: string) => ({ COMPLETED: '已完成', IN_PROGRESS: '进行中（历史状态）', ABANDONED: '已放弃' }[status] || status)
const readable = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '无'
const time = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '—'
export default function LegacyArchive() {
  const params = useParams<{ kind?: string; id?: string }>()
  const { platformRole } = useOrganization()
  const [kind, setKind] = useState<ArchiveKind>('assessments')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [total, setTotal] = useState(0)
  const [overview, setOverview] = useState<{ assessments: number; questionnaireAssessments: number; formAnswers: number } | null>(null)
  const [detail, setDetail] = useState<ArchiveDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const detailKind = params.kind as ArchiveKind | undefined
  const validKind = !detailKind || ['assessments', 'questionnaire-assessments'].includes(detailKind)
  useEffect(() => {
    let active = true
    setRows([]); setDetail(null); setOverview(null); setError(null)
    if (platformRole !== 'SYSTEM_ADMIN' || !validKind) return
    setLoading(true)
    const load = async () => {
      try {
        if (params.id && detailKind) {
          const response = await legacyArchiveApi.detail(detailKind, params.id)
          if (response.code !== 0 || !response.data) throw new Error(response.message || '历史记录无法读取')
          if (active) setDetail(response.data)
        } else {
          const [summary, response] = await Promise.all([legacyArchiveApi.overview(), legacyArchiveApi.list(kind, page, status)])
          if (summary.code !== 0 || !summary.data || response.code !== 0 || !response.data) throw new Error(response.message || summary.message || '历史归档无法读取')
          if (active) { setOverview(summary.data); setRows(response.data.list); setTotal(response.data.total) }
        }
      } catch {
        if (active) setError('历史归档暂时无法读取，请重试。')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [platformRole, validKind, detailKind, params.id, kind, page, status, revision])
  return <ProductPage width="management" className="space-y-6">
    <PageHeader title="历史归档（旧系统·只读）" description="保留旧系统的原始记录、分数、反馈和状态。" />
    <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
      旧系统原样，未重新计分。历史“进行中”记录仅供查阅，不能恢复作答。
    </div>
    {platformRole !== 'SYSTEM_ADMIN' ? <p role="alert">仅系统管理员可以读取历史归档。</p> : !validKind ? <p role="alert">历史记录类型无效。</p> : <>
      {error && <div role="alert">{error} <button className="hui-button hui-button--secondary" onClick={() => setRevision(value => value + 1)}>重试</button></div>}
      {loading && <p role="status">正在读取历史归档…</p>}
      {params.id ? <>
        <Link to="/admin/legacy-archive">返回归档列表</Link>
        {detail && <section className="staff-panel staff-panel--padded space-y-4">
          <h2>{detail.instrumentName}</h2>
          <dl><dt>用户</dt><dd>{detail.nickname || detail.username}（{detail.username}）</dd>
            <dt>旧状态</dt><dd>{statusLabel(detail.status)} · {detail.status}</dd>
            <dt>开始时间</dt><dd>{time(detail.startedAt)}</dd><dt>完成时间</dt><dd>{time(detail.completedAt)}</dd>
            <dt>原记录 ID</dt><dd>{detail.id}</dd><dt>来源</dt><dd>旧系统历史归档 · 未重新计分</dd>
          </dl>
          {(['answers', 'scores', 'feedback', 'aggregateReport'] as const).filter(field => field in detail).map(field => <section key={field}>
            <h3>{{ answers: '原始答案', scores: '原始分数', feedback: '原始反馈', aggregateReport: '原始问卷报告' }[field]}</h3>
            <pre className="whitespace-pre-wrap break-words overflow-auto">{readable(detail[field])}</pre>
          </section>)}
          {detail.formAnswers && <section><h3>原始表单答案</h3>{detail.formAnswers.map(answer => <div key={answer.id}><strong>{answer.label}</strong><pre className="whitespace-pre-wrap break-words">{readable(answer.value)}</pre></div>)}</section>}
          {detail.assessments && <section><h3>关联旧量表测评</h3>{detail.assessments.map(row => <p key={row.id}><Link to={'/admin/legacy-archive/assessments/' + encodeURIComponent(row.id)}>{row.scaleName}</Link> · {statusLabel(row.status)}</p>)}</section>}
        </section>}
      </> : <>
        {overview && <p>量表测评 {overview.assessments} 条 · 问卷测评 {overview.questionnaireAssessments} 条 · 表单答案 {overview.formAnswers} 条</p>}
        <div className="flex flex-wrap gap-4">
          <label>记录类型 <select value={kind} onChange={event => { setKind(event.target.value as ArchiveKind); setPage(1) }} className="input"><option value="assessments">量表测评</option><option value="questionnaire-assessments">问卷测评</option></select></label>
          <label>旧状态 <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }} className="input"><option value="">全部</option><option value="COMPLETED">已完成</option><option value="IN_PROGRESS">进行中</option></select></label>
        </div>
        {!loading && !error && <div className="staff-table-container"><table className="staff-table"><thead><tr><th>内容</th><th>用户</th><th>旧状态</th><th>开始时间</th><th>详情</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.id}><td>{row.instrumentName}</td><td>{row.nickname || row.username}</td><td>{statusLabel(row.status)}</td><td>{time(row.startedAt)}</td><td><Link to={'/admin/legacy-archive/' + kind + '/' + encodeURIComponent(row.id)}>只读查看</Link></td></tr>)}
          {rows.length === 0 && <tr><td colSpan={5}>没有符合条件的历史记录</td></tr>}
        </tbody></table></div>}
        <div className="flex items-center gap-4"><button disabled={loading || page === 1} className="hui-button hui-button--secondary" onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页 · {total} 条</span><button disabled={loading || page * 25 >= total} className="hui-button hui-button--secondary" onClick={() => setPage(value => value + 1)}>下一页</button></div>
      </>}
    </>}
  </ProductPage>
}
