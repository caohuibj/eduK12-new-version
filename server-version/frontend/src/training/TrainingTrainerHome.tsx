import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import ModalSurface from '../components/shared-ui/ModalSurface'
import type { Course } from '../types'

const PAGE_SIZE = 100

/** The course is the training workspace. Resources and reports live inside it. */
export default function TrainingTrainerHome() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [moreError, setMoreError] = useState('')
  const [nextPage, setNextPage] = useState(2)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mutationNotice, setMutationNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      const result = await apiClient.get<{ list: Course[]; total?: number }>(`/courses?status=all&page=1&pageSize=${PAGE_SIZE}`)
      if (result.code !== 0 || !Array.isArray(result.data?.list)) throw new Error(result.message || '无法读取课程')
      setCourses(result.data.list.filter(course => !course.isLibrary))
      setNextPage(2)
      setMoreError('')
      setHasMore(PAGE_SIZE < (result.data.total ?? result.data.list.length))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法读取课程')
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    setMoreError('')
    const page = nextPage
    try {
      const result = await apiClient.get<{ list: Course[]; total?: number }>(`/courses?status=all&page=${page}&pageSize=${PAGE_SIZE}`)
      if (result.code !== 0 || !Array.isArray(result.data?.list)) throw new Error(result.message || '无法读取更多课程')
      setCourses(current => {
        const seen = new Set(current.map(course => course.id))
        return [...current, ...result.data.list.filter(course => !course.isLibrary && !seen.has(course.id))]
      })
      setNextPage(page + 1)
      setHasMore(page * PAGE_SIZE < (result.data.total ?? (page - 1) * PAGE_SIZE + result.data.list.length))
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : '无法读取更多课程')
    } finally { setLoadingMore(false) }
  }

  useEffect(() => { void refresh() }, [])

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
      await refresh()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '课程创建失败')
    } finally {
      setCreating(false)
    }
  }

  return <div className="training-home">
    <header className="training-home-header">
      <div>
        <p className="training-eyebrow">培训师 · 我的课程</p>
        <h1>你好，{user?.nickname || user?.username || '培训师'}。</h1>
        <p className="training-home-subtitle">以课程为序，让每一步学习都有回响。</p>
      </div>
      <button type="button" className="training-action" onClick={() => { setCreateError(''); setCreateOpen(true) }}><Plus size={18} aria-hidden="true" />创建课程</button>
    </header>
    {mutationNotice && <p className="training-message" role="status">{mutationNotice}</p>}
    <section className="training-course-section" aria-labelledby="trainer-courses">
      <div className="training-section-header"><h2 id="trainer-courses">我的课程</h2><span className="training-small-label">教学 · 实践 · 反馈</span></div>
      {loading ? <p role="status" className="training-status">正在读取课程…</p>
        : loadError ? <div className="training-message" role="alert">课程暂时无法显示：{loadError}<button type="button" onClick={() => void refresh()}>重试</button></div>
        : courses.length === 0 ? <div className="training-empty"><p>还没有创建课程。</p><button type="button" onClick={() => setCreateOpen(true)}>创建第一门课程 →</button></div>
        : <div className="training-course-list">{courses.map(course =>
          <Link key={course.id} to={`/courses/${encodeURIComponent(course.id)}/detail`} className="training-course-item">
            <span className="training-course-mark" aria-hidden="true">授</span>
            <span className="training-course-text"><strong>{course.title}</strong><small>{course.description || '管理学员、作业、打卡与课程测评'}</small></span>
            <ArrowRight size={20} aria-hidden="true" />
          </Link>)}</div>}
      {!loading && !loadError && (hasMore || moreError) && <div className="training-load-more">
        {moreError && <p role="alert">后续课程暂未加载：{moreError}</p>}
        {hasMore && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="training-action training-action--quiet">
          {loadingMore ? '正在加载…' : '加载更多课程'}
        </button>}
      </div>}
    </section>
    <p className="training-bottom-line">教与学，都是一次彼此成就。</p>
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
