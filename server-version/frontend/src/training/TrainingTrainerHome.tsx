import TrainingCourseCode from './TrainingCourseCode'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import ModalSurface from '../components/shared-ui/ModalSurface'
import type { Course } from '../types'
import FormalReferenceStudio from './FormalReferenceStudio'
import './training-trainer-home.css'

const PAGE_SIZES = [2, 6, 10]
const PAGE_SIZE_STORAGE_KEY = 'training:trainer-courses:page-size'
function savedPageSize() {
  try {
    const size = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    return PAGE_SIZES.includes(size) ? size : 2
  } catch { return 2 }
}
const COURSE_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'COMPLETED', label: '已完结' },
] as const
type CourseFilter = typeof COURSE_FILTERS[number]['value']

const courseDate = (value: string) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    : null
}

function CourseDescription({ description, id }: { description: string; id: string }) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const text = textRef.current
    if (!text || expanded) return
    const measure = () => setOverflows(text.scrollHeight > text.clientHeight + 1)
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    observer?.observe(text)
    return () => observer?.disconnect()
  }, [description, expanded])

  return <div className="training-trainer-course-intro">
    <p ref={textRef} id={id} className={`training-trainer-course-description${expanded ? ' is-expanded' : ''}`}
      title={expanded ? undefined : description}>{description}</p>
    {(overflows || expanded) && <button type="button" className="training-trainer-description-toggle"
      aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      {expanded ? '收起介绍' : '展开介绍'}{expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
    </button>}
  </div>
}

/** The course is the training workspace. Resources and reports live inside it. */
export default function TrainingTrainerHome() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState(() => ({ page: 1, pageSize: savedPageSize(), status: 'all' as CourseFilter }))
  const [total, setTotal] = useState(0)
  const [mutationNotice, setMutationNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    void apiClient.get<{ list: Course[]; total?: number }>(
      `/courses?status=${query.status}&page=${query.page}&pageSize=${query.pageSize}&excludeLibrary=true`,
    ).then(result => {
      if (!active) return
      if (result.code !== 0 || !Array.isArray(result.data?.list)) throw new Error(result.message || '无法读取课程')
      const visible = result.data.list.filter(course => !course.isLibrary)
      const count = typeof result.data.total === 'number' && Number.isSafeInteger(result.data.total) && result.data.total >= 0
        ? result.data.total : visible.length
      const lastPage = Math.max(1, Math.ceil(count / query.pageSize))
      if (query.page > lastPage) {
        setQuery(current => ({ ...current, page: lastPage }))
        return
      }
      setCourses(visible)
      setTotal(count)
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : '无法读取课程')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [query])

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize))
  const pageNumbers = [...new Set([1, query.page - 1, query.page, query.page + 1, pageCount])]
    .filter(page => page >= 1 && page <= pageCount).sort((a, b) => a - b)

  function changePage(page: number) {
    if (page !== query.page) {
      setQuery(current => ({ ...current, page }))
    }
  }

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || creating) return
    setCreating(true)
    setCreateError('')
    setMutationNotice('')
    try {
      const result = await apiClient.post('/courses', { title: title.trim(), description: description.trim() })
      if (result.code !== 0) throw new Error(result.message || '课程创建失败')
      setCreateOpen(false)
      setTitle('')
      setDescription('')
      setMutationNotice('课程已创建。')
      setQuery(current => ({ ...current, page: 1, status: 'all' }))
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '课程创建失败')
    } finally {
      setCreating(false)
    }
  }

  return <div className="training-home training-trainer-home">
    <header className="training-home-header">
      <div>
        <h1 id="trainer-courses">我的课程</h1>
        <p className="training-home-subtitle">管理课程内容，邀请学员参与学习。</p>
      </div>
      <button type="button" className="training-action" onClick={() => { setCreateError(''); setCreateOpen(true) }}><Plus size={18} aria-hidden="true" />创建课程</button>
    </header>
    {mutationNotice && <p className="training-message" role="status">{mutationNotice}</p>}
    <section className="training-course-section" aria-labelledby="trainer-courses">
      <div className="training-trainer-course-controls">
        <fieldset className="training-trainer-course-filters">
          <legend>课程状态</legend>
          <div>{COURSE_FILTERS.map(filter => <button key={filter.value} type="button"
            aria-pressed={query.status === filter.value}
            onClick={() => { if (query.status !== filter.value) setQuery(current => ({ ...current, page: 1, status: filter.value })) }}>
            {filter.label}
          </button>)}</div>
        </fieldset>
        <label className="training-trainer-page-size">每页显示
          <select aria-label="每页课程数" value={query.pageSize} onChange={event => {
            const pageSize = Number(event.target.value)
            if (PAGE_SIZES.includes(pageSize)) {
              try { localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize)) } catch { /* Keep paging usable when storage is unavailable. */ }
              setQuery(current => ({ ...current, page: 1, pageSize }))
            }
          }}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size} 个</option>)}</select>
        </label>
      </div>
      {loading ? <p role="status" className="training-status">正在读取课程…</p>
        : loadError ? <div className="training-message" role="alert">课程暂时无法显示：{loadError}<button type="button" onClick={() => setQuery(current => ({ ...current }))}>重试</button></div>
        : courses.length === 0 ? <div className="training-empty">
          <p>{query.status === 'all' ? '还没有创建课程。' : `暂无${COURSE_FILTERS.find(filter => filter.value === query.status)?.label}的课程。`}</p>
          {query.status === 'all' ? <button type="button" onClick={() => setCreateOpen(true)}>创建第一门课程 →</button>
            : <button type="button" onClick={() => setQuery(current => ({ ...current, page: 1, status: 'all' }))}>查看全部课程</button>}
        </div>
        : <div className="training-trainer-course-grid">{courses.map(course => {
          const date = courseDate(course.createdAt)
          return <article key={course.id} className="training-trainer-course-card" aria-labelledby={`trainer-course-${course.id}`}>
            <div className="training-trainer-card-heading">
              <h3 id={`trainer-course-${course.id}`}><Link to={`/courses/${encodeURIComponent(course.id)}/detail`} title={course.title}>{course.title}</Link></h3>
              <span className={`training-trainer-course-state is-${course.status?.toLowerCase()}`}>{course.status === 'DRAFT' ? '草稿' : COURSE_FILTERS.find(filter => filter.value === course.status)?.label}</span>
            </div>
            <CourseDescription id={`trainer-course-description-${course.id}`} description={course.description || '管理学员、练习、打卡与课程测评'} />
            <TrainingCourseCode key={course.id+course.courseCode} compact code={course.courseCode} title={course.title}/>
            <div className="training-trainer-card-footer">
              <div className="training-trainer-course-details">
                {typeof course.studentCount === 'number' && <span>{course.studentCount} 位学员</span>}
                {date && <time dateTime={course.createdAt}>创建于 {date}</time>}
              </div>
              <Link to={`/courses/${encodeURIComponent(course.id)}/detail`}>管理课程 <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          </article>
        })}</div>}
      {!loading && !loadError && total > 0 && <nav className="training-trainer-pagination" aria-label="课程分页">
        <p aria-live="polite">共 {total} 门课程 · 第 {query.page} / {pageCount} 页</p>
        <div className="training-trainer-page-buttons">
          <button type="button" disabled={query.page === 1} onClick={() => changePage(query.page - 1)}>上一页</button>
          {pageNumbers.map((page, index) => <span key={page} className="training-trainer-page-number">
            {index > 0 && page - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}
            <button type="button" aria-label={`第 ${page} 页`} aria-current={query.page === page ? 'page' : undefined} onClick={() => changePage(page)}>{page}</button>
          </span>)}
          <button type="button" disabled={query.page === pageCount} onClick={() => changePage(query.page + 1)}>下一页</button>
        </div>
      </nav>}
    </section>
    {user?.id&&<FormalReferenceStudio key={user.id+':formal-governance'} actorId={user.id}/>}
    {createOpen && <ModalSurface open={createOpen} onClose={() => { if (!creating) setCreateOpen(false) }} initialFocusRef={titleRef} className="training-dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="training-create-title" className="training-dialog" tabIndex={-1}>
        <h2 id="training-create-title">创建课程</h2>
        <p>设置课程名称，创建后即可获取课程码并邀请学员。</p>
        {createError && <p role="alert" className="training-error">{createError}</p>}
        <form onSubmit={createCourse}>
          <label htmlFor="training-new-title">课程名称</label>
          <input id="training-new-title" ref={titleRef} required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：教师专业发展研修" />
          <label htmlFor="training-new-description">课程说明（选填）</label>
          <textarea id="training-new-description" rows={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="让学员知道这门课程的学习目标" />
          <div className="training-dialog-actions">
            <button type="button" disabled={creating} className="training-action training-action--quiet" onClick={() => setCreateOpen(false)}>取消</button>
            <button type="submit" disabled={creating || !title.trim()} className="training-action">{creating ? '创建中…' : '创建课程'}</button>
          </div>
        </form>
      </section>
    </ModalSurface>}
  </div>
}
