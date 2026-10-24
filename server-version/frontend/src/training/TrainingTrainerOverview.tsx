import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCheck, ClipboardCheck, RefreshCw, X } from 'lucide-react'
import apiClient from '../api/client'
import './training-trainer-overview.css'

export type TeachingOverview = {
  summary: { pendingSubmissions: number; pendingAssignments: number; courses: number; publishedCourses: number }
  list: { id: string; title: string; course: { id: string; title: string }; pendingCount: number; oldestSubmittedAt: string | null; href: string }[]
  total: number; page: number; pageSize: number
}
const dateLabel = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}
export default function TrainingTrainerOverview({ heading, refreshKey = 0 }: { heading?: ReactNode; refreshKey?: number }) {
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<TeachingOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData(null)
    void apiClient.get<TeachingOverview>('/courses/my/teaching-overview?page=' + page + '&pageSize=5').then(response => {
      if (!active) return
      const next = response.data
      if (response.code !== 0 || !next || !Array.isArray(next.list) || !next.summary
        || (['pendingSubmissions', 'pendingAssignments', 'courses', 'publishedCourses'] as const).some(key => !Number.isSafeInteger(next.summary[key]) || next.summary[key] < 0)
        || !Number.isSafeInteger(next.total) || next.total < 0 || next.page !== page || next.pageSize !== 5
        || next.list.some(row => typeof row.href !== 'string' || !row.href.startsWith('/courses/'))) {
        throw new Error(response.message || '批阅概览数据不完整，请重试')
      }
      const lastPage = Math.max(1, Math.ceil(next.total / 5))
      if (page > lastPage) { setPage(lastPage); return }
      setData(next)
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : '批阅概览暂时无法读取，请重试')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, revision, refreshKey])
  useEffect(() => { if (expanded) reviewHeading.current?.focus() }, [expanded])
  const retry = () => setRevision(value => value + 1)
  const summary = data?.summary
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 5))
  return <section className="trainer-overview" aria-label="培训工作概览">
    <header className="trainer-home-summary">
      {heading}
    <div className="trainer-shortcuts">
      <button type="button" className="trainer-shortcut trainer-shortcut--review" aria-expanded={expanded} aria-controls={expanded ? 'trainer-review-panel' : undefined} onClick={() => setExpanded(value => !value)}>
        <span className="trainer-shortcut-top"><span className="trainer-shortcut-icon"><ClipboardCheck size={21} aria-hidden="true" /></span><ArrowRight size={19} aria-hidden="true" /></span>
        <span className="trainer-shortcut-title">待批阅练习<span className="trainer-shortcut-count">{summary?.pendingSubmissions ?? '—'}<small>份提交</small></span></span>
        <span className="trainer-shortcut-description">{summary ? summary.pendingAssignments + ' 项练习等待反馈' : '汇总自己课程中已提交的练习'}</span>
      </button>
    </div>
    </header>
    {!expanded && error && <div className="trainer-overview-error" role="alert"><p>{error}，课程管理仍可使用。</p><button type="button" onClick={retry}>重读批阅概览</button></div>}
    {expanded && <section className="trainer-review" id="trainer-review-panel" aria-labelledby="trainer-review-title" aria-busy={loading}>
      <header className="trainer-review-header"><div><h2 id="trainer-review-title" ref={reviewHeading} tabIndex={-1}>待批阅练习</h2><p>按最早提交时间排序，仅统计已提交、尚未批阅的练习。</p></div><div className="trainer-review-actions"><button type="button" onClick={retry} disabled={loading} aria-label="刷新待批阅列表"><RefreshCw size={17} aria-hidden="true" /></button><button type="button" onClick={() => setExpanded(false)} aria-label="收起待批阅列表"><X size={19} aria-hidden="true" /></button></div></header>
      {loading ? <div className="trainer-review-empty" role="status">正在汇总待批阅练习…</div>
        : error ? <div className="trainer-review-empty" role="alert"><p>{error}</p><button type="button" onClick={retry}>重试待批阅列表</button></div>
          : !data?.list.length ? <div className="trainer-review-empty" role="status"><CheckCheck size={27} aria-hidden="true" /><h3>暂时没有待批阅的练习</h3><p>学员提交练习后，会汇总到这里。</p></div>
            : <><ul className="trainer-review-list">{data.list.map(row => <li key={row.id}>
              <div className="trainer-review-copy"><span className="trainer-review-count">{row.pendingCount} 份待批阅</span><h3>{row.title}</h3><p>{row.course.title}</p>{row.oldestSubmittedAt && <small>最早提交 {dateLabel(row.oldestSubmittedAt)}</small>}</div>
              <Link to={row.href} aria-label={'查看并批阅：' + row.title}>查看并批阅<ArrowRight size={16} aria-hidden="true" /></Link>
            </li>)}</ul><nav className="trainer-review-pagination" aria-label="待批阅练习分页"><span>共 {data.total} 项练习 · 第 {page} / {pages} 页</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页练习</button><button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>下一页练习</button></div></nav></>}
    </section>}
  </section>
}
