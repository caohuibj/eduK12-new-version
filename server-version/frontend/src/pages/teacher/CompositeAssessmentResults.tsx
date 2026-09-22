import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { compositeApi } from '../../modules/composite/api'
import type {
  CompositeAttemptListStatus,
  CompositeTeacherAttemptRow,
  CompositeTeacherAttemptsResponse,
} from '../../modules/composite/types'

const statusLabel: Record<CompositeAttemptListStatus, string> = {
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  ABANDONED: '已放弃',
}

const formatTime = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN')
}

const CompositeAssessmentResults: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CompositeTeacherAttemptsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'' | CompositeAttemptListStatus>('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const response = await compositeApi.attempts(id, {
        status: status || undefined,
        q: q || undefined,
        page,
        pageSize: 20,
      })
      if (response.code !== 0 || !response.data) throw new Error(response.message || '无法加载作答名单')
      setData(response.data)
      setError(null)
    } catch (err) {
      setData(null)
      setError((err as { message?: string }).message || '无法加载作答名单')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id, status, q, page])

  const openReport = (row: CompositeTeacherAttemptRow) => {
    if (row.status !== 'COMPLETED') return
    navigate(`/composite-assessments/${id}/attempts/${row.id}/report`)
  }

  const counts = data?.attemptCounts

  return (
    <div>
      <button onClick={() => navigate((data?.assessment as any)?.productKind === 'QUESTIONNAIRE' ? '/questionnaire-products/' + id : '/composite-assessments/' + id)} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />返回配置
      </button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{data?.assessment.name || '作答结果'}</h1>
          <p className="text-sm text-gray-500">{data?.assessment.code}</p>
        </div>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-4"><p className="text-sm text-gray-500">已开始</p><p className="text-2xl font-semibold">{counts?.started ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">进行中</p><p className="text-2xl font-semibold">{counts?.inProgress ?? 0}</p></div>
        <div className="card p-4"><p className="text-sm text-gray-500">已完成</p><p className="text-2xl font-semibold">{counts?.completed ?? 0}</p></div>
      </div>
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
              <option value="COMPLETED">已完成</option>
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
      <div className="card p-0 overflow-auto">
        {loading ? (
          <p className="p-6 text-gray-500">加载中...</p>
        ) : !data?.list.length ? (
          <p className="p-6 text-gray-500">还没有作答记录</p>
        ) : (
          <table className="w-full text-sm">
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
                  <td className="px-4 py-3 text-gray-600">{statusLabel[row.status]}</td>
                  <td className="px-4 py-3 text-gray-600">{row.progress}%</td>
                  <td className="px-4 py-3 text-gray-600">{formatTime(row.startedAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatTime(row.completedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="btn-secondary py-1 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={row.status !== 'COMPLETED'}
                      title={row.status === 'COMPLETED' ? '查看报告' : '完成后方可查看报告'}
                      onClick={() => openReport(row)}
                    >
                      查看
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
    </div>
  )
}

export default CompositeAssessmentResults
