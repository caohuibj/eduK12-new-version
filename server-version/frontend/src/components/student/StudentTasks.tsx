import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ProductButton, ProductStatus } from '../product-ui'

const labels = { PENDING: '待完成', IN_PROGRESS: '进行中', UPCOMING: '未开始', EXPIRED: '已截止', COMPLETED: '已完成', UNAVAILABLE: '次数已用尽' }
type State = keyof typeof labels
export interface TaskPage {
  list: { id: string; kind: 'ASSIGNMENT' | 'CHECKIN' | 'QUESTIONNAIRE' | 'COMPOSITE'; title: string;
    courses: { id: string; title: string }[]; state: State; deadline: string | null; opensAt: string | null;
    canContinue: boolean; canStart: boolean; href: string | null }[]
  counts: Record<State, number> & { ACTIONABLE?: number }
  page: number
  pageSize: number
  total: number
  generatedAt: string
}
const kindLabels = { ASSIGNMENT: '作业', CHECKIN: '打卡', QUESTIONNAIRE: '问卷', COMPOSITE: '组合测评' }

export default function StudentTasks({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<State | 'ACTIONABLE' | ''>('ACTIONABLE')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<TaskPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const query = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (state) query.set('state', state)
    void apiClient.get<TaskPage>(`/courses/my/tasks?${query}`).then(response => {
      if (!active) return
      if (response.code !== 0 || !response.data || !Array.isArray(response.data.list) || !response.data.counts) {
        throw new Error(response.message || '待办加载失败')
      }
      // Course removal/completion can shrink the result while on a later page.
      const lastPage = Math.max(1, Math.ceil(response.data.total / response.data.pageSize))
      if (page > lastPage) { setPage(lastPage); return }
      setResult(response.data)
    }).catch(cause => {
      const message = cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
        ? cause.message : '请稍后重试'
      if (active) setError(message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [state, page, retry, refreshKey])
  return <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="student-tasks-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="student-tasks-title" className="text-lg font-semibold text-slate-900">我的待办</h2><p className="mt-1 text-sm text-slate-600">查看各课程任务，继续尚未完成的内容。</p></div>
      <ProductButton onClick={() => setRetry(value => value + 1)} disabled={loading}>刷新待办</ProductButton>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><label htmlFor="student-task-state">任务状态</label>
      <select id="student-task-state" className="input w-auto" value={state} onChange={event => { setState(event.target.value as State | 'ACTIONABLE' | ''); setPage(1) }}>
        <option value="ACTIONABLE">需要处理{result?.counts.ACTIONABLE !== undefined ? `（${result.counts.ACTIONABLE}）` : ''}</option>
        <option value="">全部状态</option>
        {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}{result ? `（${result.counts[key as State]}）` : ''}</option>)}
      </select>
    </div>
    {loading ? <ProductStatus kind="pending" title="正在加载待办" announce="polite" />
      : error ? <ProductStatus kind="error" title="待办加载失败" announce="assertive" actions={<ProductButton onClick={() => setRetry(value => value + 1)}>重试待办</ProductButton>}>{error}</ProductStatus>
        : !result?.list.length ? <ProductStatus kind="info" title="当前没有此类任务" announce="polite">已发布且你有权访问的任务会显示在这里。</ProductStatus>
          : <>
            <ul className="divide-y divide-slate-200">
              {result.list.map(task => <li key={`${task.kind}:${task.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 flex-1"><h3 className="break-words font-medium text-slate-900">{task.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{kindLabels[task.kind]} · {task.courses.map(course => course.title).join('、') || '公共问卷'} · {labels[task.state]}</p>
                  {task.opensAt && task.state === 'UPCOMING' ? <p className="mt-1 text-sm text-slate-600">开始时间：{new Date(task.opensAt).toLocaleString('zh-CN')}</p> : null}
                  {task.deadline ? <p className="mt-1 text-sm text-slate-600">截止时间：{new Date(task.deadline).toLocaleString('zh-CN')}</p> : null}
                </div>
                {task.href ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" to={task.href} aria-label={`${task.canContinue ? '继续' : task.canStart ? '开始' : '查看'}${task.title}`}>{task.canContinue ? '继续任务' : task.canStart ? '开始任务' : '查看任务'}</Link> : <span className="text-sm text-slate-600">{labels[task.state]}</span>}
              </li>)}
            </ul>
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="待办分页">
              <span role="status" className="text-sm text-slate-600">第 {page} / {Math.max(1, Math.ceil(result.total / result.pageSize))} 页，共 {result.total} 项</span>
              <div className="flex gap-2"><ProductButton disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</ProductButton><ProductButton disabled={page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>下一页</ProductButton></div>
            </nav>
          </>}
  </section>
}
