import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
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

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader title={data?.assessment.name || '作答与报告'} description={data?.assessment.code || '查看参与者进度与已完成报告'} actions={editorPath ? <button onClick={() => navigate(editorPath)} className="staff-secondary-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" />返回配置</button> : undefined} />
      {error && <ProductStatus kind="error" title="作答名单加载失败" actions={<button type="button" className="btn-secondary" onClick={() => setRevision(value => value + 1)}>重试</button>}>{error}</ProductStatus>}
      {isBundle && <p className="text-sm text-gray-600">综合报告可用时，可在报告页导出 JSON。</p>}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-4"><p className="text-sm text-gray-500">已开始</p><p className="text-2xl font-semibold">{counts?.started ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">进行中</p><p className="text-2xl font-semibold">{counts?.inProgress ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">已交卷</p><p className="text-2xl font-semibold">{counts?.completed ?? 0}</p></div>
      </div>
      <p className="text-sm text-gray-600">按作答次数统计；已交卷中任务达成 {counts?.satisfied ?? counts?.completed ?? 0} 次，未达成 {counts?.notSatisfied ?? 0} 次。重复作答不去重为人数。</p>
      <div className="card p-5 mb-5">
        <form
          className="flex flex-wrap gap-3 items-end"
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
          <button type="submit" className="btn-secondary">筛选</button>
        </form>
      </div>
      <div className="staff-table-container">
        {loading ? (
          <p className="p-6 text-gray-500">加载中...</p>
        ) : !data?.list.length ? (
          <p className="p-6 text-gray-500">还没有作答记录</p>
        ) : (
          <table className="staff-table">
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
                  <td className="px-4 py-3 text-gray-600">{row.isAnonymous ? '匿名' : '登录'}</td>
                  <td className="px-4 py-3 text-gray-600">{statusLabel[row.status]}{row.status === 'COMPLETED' && <div className="text-xs">{row.taskSatisfied === false ? '任务未达成' : '任务已达成'}</div>}</td>
                  <td className="px-4 py-3 text-gray-600" title={row.progressUnavailableReason || undefined}>{row.progressUnavailableReason ? '进度待核对' : `${row.progress}%`}</td>
                  <td className="px-4 py-3 text-gray-600">{formatTime(row.startedAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatTime(row.completedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="btn-secondary py-1 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!reportAvailable(row)}
                      title={row.status === 'COMPLETED' ? '查看报告' : reportAvailable(row) ? '只读查看已完成单项' : '完成后方可查看报告'}
                      onClick={() => openReport(row)}
                    >
                      {isBundle && row.status === 'COMPLETED' ? '查看报告' : row.status !== 'COMPLETED' && reportAvailable(row) ? '已完成单项' : '查看'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>共 {data.total} 条，第 {data.page}/{data.totalPages} 页</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={data.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <button className="btn-secondary" disabled={!data.hasMore} onClick={() => setPage((current) => current + 1)}>下一页</button>
          </div>
        </div>
      )}
    </ProductPage>
  )
}

export default CompositeAssessmentResults
