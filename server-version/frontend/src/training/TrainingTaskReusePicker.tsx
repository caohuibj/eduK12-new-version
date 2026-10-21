import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, ClipboardList, Search } from 'lucide-react'
import apiClient from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import ManagementDialog from '../components/staff-ui/ManagementDialog'
import type { Assignment, Checkin, Course } from '../types'
import './training-task-reuse.css'

type Row = { id: string; title: string; courseId: string; course?: { title?: string } }
export default function TrainingTaskReusePicker({ kind, courses, initialCourseId, onClose, onSelect }: {
  kind: 'assignments' | 'checkins'
  courses: Course[]
  initialCourseId: string | null
  onClose: () => void
  onSelect: (source: Assignment | Checkin, courseId: string) => void
}) {
  const { user } = useAuth()
  const label = kind === 'assignments' ? '练习' : '打卡'
  const [courseId, setCourseId] = useState(initialCourseId || '')
  const [search, setSearch] = useState(''), [query, setQuery] = useState({ search: '', page: 1, revision: 0 })
  const [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [selecting, setSelecting] = useState('')
  const alive = useRef(true), selection = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setRows([])
    const params = new URLSearchParams({ view: 'summary', page: String(query.page), pageSize: '10', search: query.search })
    void apiClient.get<{ list: Row[]; total: number }>('/' + kind + '?' + params).then(response => {
      if (!active) return
      if (response.code !== 0 || !Array.isArray(response.data?.list)) throw Error(response.message || '读取失败')
      setRows(response.data.list); setTotal(response.data.total)
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '读取失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind, query])
  async function select(row: Row) {
    if (selection.current || !user || !courses.some(course => course.id === courseId && course.creatorId === user.id)) return
    selection.current = true; setSelecting(row.id); setError('')
    try {
      const response = await apiClient.get<Assignment | Checkin>('/' + kind + '/' + encodeURIComponent(row.id) + '?courseId=' + encodeURIComponent(row.courseId))
      if (!alive.current) return
      const source = response.data
      if (response.code !== 0 || !source || source.id !== row.id || source.courseId !== row.courseId || source.course?.id !== row.courseId || source.course.creatorId !== user.id) throw Error(response.message || '无法复用此任务，请核对当前权限')
      onSelect(source, courseId)
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '读取失败') }
    finally { selection.current = false; if (alive.current) setSelecting('') }
  }
  function apply(event: FormEvent) { event.preventDefault(); setQuery(current => ({ ...current, search: search.trim(), page: 1 })) }
  const target = courses.find(course => course.id === courseId && course.creatorId === user?.id)
  const pageCount = Math.max(1, Math.ceil(total / 10))
  return <ManagementDialog open title={'复用' + label} description="选择已有内容，编辑后另行发布。" onClose={onClose} closeDisabled={Boolean(selecting)} width="wide" actions={<div className="training-reuse-footer">
    <span>{loading ? '正在读取…' : `共 ${total} 份`}</span>
    {total > 10 && <nav aria-label="复用内容分页"><button type="button" disabled={loading || query.page === 1 || Boolean(selecting)} onClick={() => setQuery(current => ({ ...current, page: current.page - 1 }))}>上一页</button><span>{query.page} / {pageCount}</span><button type="button" disabled={loading || query.page * 10 >= total || Boolean(selecting)} onClick={() => setQuery(current => ({ ...current, page: current.page + 1 }))}>下一页</button></nav>}
    <button type="button" disabled={Boolean(selecting)} onClick={onClose}>取消</button>
  </div>}>
    <div className="training-task-reuse">
      {initialCourseId ? <div className="training-reuse-target"><BookOpen size={20} aria-hidden="true" /><div><span>用于课程</span><strong>{target?.title || '正在确认课程…'}</strong></div></div> : <label>用于课程<select aria-label="复用到课程" value={courseId} disabled={Boolean(selecting)} onChange={event => setCourseId(event.target.value)}><option value="">请选择课程</option>{courses.filter(course => course.creatorId === user?.id).map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>}
      <p className="training-reuse-note">仅复用内容、题目、附件和标签；不带入起止时间、已有提交或成绩。</p>
      <form onSubmit={apply} className="training-reuse-search"><Search size={18} aria-hidden="true" /><input aria-label={'搜索已有' + label} placeholder={'搜索已有' + label + '标题'} maxLength={200} value={search} disabled={Boolean(selecting)} onChange={event => setSearch(event.target.value)} /><button type="submit" disabled={Boolean(selecting)}>搜索</button></form>
      {error && <p role="alert" className="training-reuse-error">{error}<button type="button" onClick={() => setQuery(current => ({ ...current, revision: current.revision + 1 }))}>重新加载</button></p>}
      {loading ? <p role="status" className="training-reuse-empty">正在读取已有{label}…</p> : !rows.length ? !error && <div className="training-reuse-empty"><ClipboardList size={28} aria-hidden="true" /><strong>暂无可复用的{label}</strong><p>可调整搜索条件，或关闭窗口后发布新内容。</p></div> : <ul aria-label={'可复用的' + label}>{rows.map(row => <li key={row.id}><span className="training-reuse-source-icon"><ClipboardList size={21} aria-hidden="true" /></span><div><strong>{row.title}</strong><small>来源课程 · {row.course?.title || '已有课程'}</small></div><button type="button" disabled={!target || Boolean(selecting)} onClick={() => void select(row)}>{selecting === row.id ? '正在读取…' : '使用此内容'}<ArrowRight size={15} aria-hidden="true" /></button></li>)}</ul>}
    </div>
  </ManagementDialog>
}
