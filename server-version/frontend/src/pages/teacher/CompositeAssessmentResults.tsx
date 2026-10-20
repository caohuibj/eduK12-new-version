import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, CheckCheck, CircleCheck, Clock3, FileText, Info, Search, Users } from 'lucide-react'
import { isTrainingHost } from '../../training/context'
import './composite-training-results.css'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import { compositeApi } from '../../modules/composite/api'
import { useAuth } from '../../contexts/AuthContext'
import type {
  CompositeAttemptListStatus,
  CompositeTeacherAttemptRow,
  CompositeTeacherAttemptsResponse,
} from '../../modules/composite/types'

const statusLabel: Record<CompositeAttemptListStatus, string> = {
  IN_PROGRESS: '进行中',
  COMPLETED: '已交卷',
  ABANDONED: '已放弃',
}

const formatTime = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN')
}

const CompositeAssessmentResults: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  return <CompositeAssessmentResultsContent key={JSON.stringify([user?.id, user?.role, id])} id={id} />
}

const CompositeAssessmentResultsContent: React.FC<{ id: string }> = ({ id }) => {
  const navigate = useNavigate()
  const trainingDesign = isTrainingHost()
  const [data, setData] = useState<CompositeTeacherAttemptsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'' | CompositeAttemptListStatus>('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setData(null)
    setError(null)
    void (async () => {
      try {
        if (!id) throw new Error('测评链接无效')
        const response = await compositeApi.attempts(id, {
          status: status || undefined,
          q: q || undefined,
          page,
          pageSize: 20,
        })
        if (!active) return
        if (response.code !== 0 || !response.data || response.data.assessment.id !== id) throw new Error(response.message || '无法加载作答名单')
        setData(response.data)
      } catch (err) {
        if (active) {
          setData(null)
          setError((err as { message?: string }).message || '无法加载作答名单')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [id, status, q, page, revision])

  const productKind = data?.assessment.productKind
  const isBundle = productKind === 'ASSESSMENT_BUNDLE'
  const editorPath = productKind === 'QUESTIONNAIRE' ? '/questionnaire-products/' + encodeURIComponent(id)
    : isBundle ? '/bundle-products/' + encodeURIComponent(id)
      : productKind === 'LEGACY_COMPOSITE' ? '/composite-assessments/' + encodeURIComponent(id) : null
  const reportAvailable = (row: CompositeTeacherAttemptRow) => row.status === 'COMPLETED' || (!isBundle && row.partialReportAvailable)

  const openReport = (row: CompositeTeacherAttemptRow) => {
    if (!reportAvailable(row)) return
    navigate(`/composite-assessments/${id}/attempts/${row.id}/report${row.status === 'COMPLETED' ? '' : '?partial=1'}`)
  }

  const counts = data?.attemptCounts
  const metric = (value: number | undefined) => data ? value ?? 0 : '—'
  const filtered = Boolean(status || q)
  const assessmentStatus = data?.assessment.status === 'DRAFT' ? '草稿' : data?.assessment.status === 'PUBLISHED' ? '已发布' : data?.assessment.status === 'ARCHIVED' ? '已归档' : '作答与报告'
  const stats = trainingDesign ? <section className="tr-result-stats" aria-label="作答概览">
    {[
      { label: '已开始', value: counts?.started, hint: '累计开始的作答次数', icon: Users },
      { label: '进行中', value: counts?.inProgress, hint: '已开始，尚未交卷', icon: Clock3 },
      { label: '已交卷', value: counts?.completed, hint: '已完成提交的作答', icon: FileText },
      { label: '任务达成', value: counts?.satisfied ?? counts?.completed, hint: '已交卷且满足任务要求', icon: CheckCheck },
    ].map(({ label, value, hint, icon: Icon }) => <article key={label} className="tr-result-stat"><div><span>{label}</span><Icon size={18} aria-hidden="true" /></div><strong>{metric(value)}</strong><p>{hint}</p></article>)}
  </section> : <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-4"><p className="text-sm text-gray-500">已开始</p><p className="text-2xl font-semibold">{counts?.started ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">进行中</p><p className="text-2xl font-semibold">{counts?.inProgress ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">已交卷</p><p className="text-2xl font-semibold">{counts?.completed ?? 0}</p></div>
      </div>

  return (
    <ProductPage width="management" className={trainingDesign ? "tr-results" : "space-y-6"}>
      {trainingDesign && <div className="tr-result-eyebrow"><span>课程测评</span><span> / </span><strong>作答与报告</strong></div>}
      <PageHeader title={data?.assessment.name || '作答与报告'} description={trainingDesign ? '查看学员的作答进度，打开已完成的测评报告。' : data?.assessment.code || '查看参与者进度与已完成报告'} actions={editorPath ? <button onClick={() => navigate(editorPath)} className="staff-secondary-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" />返回配置</button> : undefined} />
      {trainingDesign && data && <div className="tr-result-meta"><span className="tr-result-assessment-status"><CircleCheck size={13} aria-hidden="true" />{assessmentStatus}</span><span>测评编号：{data.assessment.code}</span></div>}
      {error && <ProductStatus kind="error" title="作答名单加载失败" actions={<button type="button" className="btn-secondary" onClick={() => setRevision(value => value + 1)}>重试</button>}>{error}</ProductStatus>}
      {isBundle && <p className="text-sm text-gray-600">综合报告可用时，可在报告页导出 JSON。</p>}
      {stats}
      {(!trainingDesign || data) && <p className={trainingDesign ? 'tr-result-count-note' : 'text-sm text-gray-600'}>{trainingDesign && <Info size={15} aria-hidden="true" />}<span>按作答次数统计；已交卷中任务达成 {counts?.satisfied ?? counts?.completed ?? 0} 次，未达成 {counts?.notSatisfied ?? 0} 次。重复作答不去重为人数。</span></p>}
      <section className={trainingDesign ? 'tr-result-records' : undefined} aria-label={trainingDesign ? '作答名单' : undefined}>
      {trainingDesign && <header className="tr-records-heading"><div><h2>作答记录</h2><p>按状态或参与者查找，每次作答单独列出。</p></div><span>{loading ? '正在加载' : error ? '暂不可用' : `共 ${data?.total ?? 0} 条${filtered ? '筛选结果' : '记录'}`}</span></header>}
      <div className={trainingDesign ? 'tr-result-filters' : 'card p-5 mb-5'}>
        <form
          className={trainingDesign ? "tr-filter-form" : "flex flex-wrap gap-3 items-end"}
          onSubmit={(event) => {
            event.preventDefault()
            setPage(1)
            setQ(qInput.trim())
          }}
        >
          <label className="text-sm text-gray-600">
            状态
            <select
              className="mt-1 block border rounded px-3 py-2"
              value={status}
              onChange={(event) => {
                setPage(1)
                setStatus(event.target.value as '' | CompositeAttemptListStatus)
              }}
            >
              <option value="">全部</option>
              <option value="IN_PROGRESS">进行中</option>
              <option value="COMPLETED">已交卷</option>
              <option value="ABANDONED">已放弃</option>
            </select>
          </label>
          <label className="text-sm text-gray-600 flex-1 min-w-[12rem]">
            搜索
            <input
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="昵称、用户名或匿名编号"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
            />
          </label>
          <button type="submit" className={trainingDesign ? 'tr-result-button is-primary' : 'btn-secondary'}>{trainingDesign && <Search size={16} aria-hidden="true" />}筛选</button>
          {trainingDesign && (status || q || qInput) && <button type="button" className="tr-result-clear" onClick={() => { setStatus(''); setQInput(''); setQ(''); setPage(1) }}>清除筛选</button>}
        </form>
      </div>
      <div className={trainingDesign ? "tr-result-table-wrap" : "staff-table-container"} aria-busy={loading}>
        {loading ? (
          trainingDesign ? <div className="tr-result-empty" role="status"><span className="tr-empty-icon"><Clock3 size={25} aria-hidden="true" /></span><h3>正在加载作答记录</h3><p>请稍候，正在获取最新进度。</p></div> : <p className="p-6 text-gray-500">加载中...</p>
        ) : trainingDesign && error ? null : !data?.list.length ? (
          trainingDesign ? <div className="tr-result-empty"><span className="tr-empty-icon"><Users size={27} aria-hidden="true" /></span><h3>{filtered ? '没有符合条件的作答记录' : '还没有作答记录'}</h3><p>{filtered ? '试试其他关键词，或清除筛选条件后查看。' : '学员开始作答后，进度和报告入口会显示在这里。'}</p>{!filtered && <small>已交卷可查看完整报告；支持时，也可只读查看已完成的单项。</small>}</div> : <p className="p-6 text-gray-500">还没有作答记录</p>
        ) : (
          <table className={trainingDesign ? "tr-result-table" : "staff-table"}>
            {trainingDesign && <caption className="sr-only">参与者作答状态与报告入口</caption>}
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">参与者</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">进度</th>
                <th className="px-4 py-3 font-medium">开始时间</th>
                <th className="px-4 py-3 font-medium">完成时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="text-gray-800">{row.displayName ?? (row.username != null ? '' : '—')}</div>
                    {row.username != null && <div className="text-xs text-gray-400">{row.username}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600"><span className={trainingDesign ? "tr-participant-type" : undefined}>{row.isAnonymous ? '匿名' : '登录'}</span></td>
                  <td className="px-4 py-3 text-gray-600"><span className={trainingDesign ? 'tr-attempt-status' : undefined} data-status={row.status}>{statusLabel[row.status]}</span>{row.status === 'COMPLETED' && <div className="text-xs">{row.taskSatisfied === false ? '任务未达成' : '任务已达成'}</div>}</td>
                  <td className="px-4 py-3 text-gray-600" title={row.progressUnavailableReason || undefined}>{trainingDesign && !row.progressUnavailableReason && <progress className="tr-row-progress" aria-label={`${row.displayName || row.username || '参与者'}的作答进度`} max={100} value={Number.isFinite(row.progress) ? Math.max(0, Math.min(100, row.progress)) : 0} />}{row.progressUnavailableReason ? '进度待核对' : `${row.progress}%`}</td>
                  <td className="px-4 py-3 text-gray-600">{formatTime(row.startedAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatTime(row.completedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className={trainingDesign ? "tr-result-button tr-report-button" : "btn-secondary py-1 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"}
                      disabled={!reportAvailable(row)}
                      title={row.status === 'COMPLETED' ? '查看报告' : reportAvailable(row) ? '只读查看已完成单项' : '完成后方可查看报告'}
                      onClick={() => openReport(row)}
                    >
                      {(trainingDesign || isBundle) && row.status === 'COMPLETED' ? '查看报告' : row.status !== 'COMPLETED' && reportAvailable(row) ? '已完成单项' : '查看'}
                      {trainingDesign && reportAvailable(row) && <ArrowUpRight size={14} aria-hidden="true" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.totalPages > 1 && (
        <nav className={trainingDesign ? 'tr-result-pagination' : 'flex items-center justify-between mt-4 text-sm text-gray-600'} aria-label="作答记录分页">
          <span>共 {data.total} 条，第 {data.page}/{data.totalPages} 页</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={data.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <button className="btn-secondary" disabled={!data.hasMore} onClick={() => setPage((current) => current + 1)}>下一页</button>
          </div>
        </nav>
      )}
      </section>
    </ProductPage>
  )
}

export default CompositeAssessmentResults
