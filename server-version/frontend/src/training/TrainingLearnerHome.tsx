import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import ModalSurface from '../components/shared-ui/ModalSurface'
import type { Course } from '../types'

/** Course-first training home. The generic STUDENT homepage is unchanged. */
export default function TrainingLearnerHome() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [mutationNotice, setMutationNotice] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [courseCode, setCourseCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      const result = await apiClient.get<{ list: Course[] }>('/courses/my')
      if (result.code !== 0) throw new Error(result.message || '无法读取课程')
      setCourses(result.data.list)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法读取课程')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function joinCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!courseCode.trim() || joining) return
    setJoining(true)
    setJoinError('')
    setMutationNotice('')
    try {
      const result = await apiClient.post('/courses/join', { courseCode: courseCode.trim() })
      if (result.code !== 0) throw new Error(result.message || '加入课程失败')
      setJoinOpen(false)
      setCourseCode('')
      setMutationNotice('已加入课程。')
      await refresh()
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : '加入课程失败')
    } finally {
      setJoining(false)
    }
  }

  return <div className="training-home">
    <header className="training-home-header">
      <div>
        <p className="training-eyebrow">学员 · 我的课程</p>
        <h1>你好，{user?.nickname || user?.username || '学员'}。</h1>
        <p className="training-home-subtitle">从一门课程开始，认真做好眼前的事。</p>
      </div>
      <button type="button" className="training-action" onClick={() => { setJoinError(''); setJoinOpen(true) }}><Plus size={18} aria-hidden="true" />加入课程</button>
    </header>

    {mutationNotice && <p className="training-message" role="status">{mutationNotice}</p>}
    <section className="training-course-section" aria-labelledby="learner-courses">
      <div className="training-section-header"><h2 id="learner-courses">我的课程</h2><span className="training-small-label">慢慢学 · 认真做</span></div>
      {loading ? <p role="status" className="training-status">正在读取课程…</p>
        : loadError ? <div className="training-message" role="alert">课程暂时无法显示：{loadError}<button type="button" onClick={() => void refresh()}>重试</button></div>
        : courses.length === 0 ? <div className="training-empty"><p>还没有加入课程。</p><button type="button" onClick={() => setJoinOpen(true)}>输入培训师提供的课程码 →</button></div>
        : <div className="training-course-list">{courses.map(course =>
          <Link key={course.id} to={`/student/courses/${encodeURIComponent(course.id)}`} className="training-course-item">
            <span className="training-course-mark" aria-hidden="true">课</span>
            <span className="training-course-text"><strong>{course.title}</strong>{course.description ? <small>{course.description}</small> : <small>进入课程，查看作业、打卡与测评</small>}</span>
            <ArrowRight size={20} aria-hidden="true" />
          </Link>)}</div>}
    </section>

    <p className="training-bottom-line">日日有所学，终将有所见。</p>

    {joinOpen && <ModalSurface open={joinOpen} onClose={() => { if (!joining) setJoinOpen(false) }} initialFocusRef={inputRef} className="training-dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="training-join-title" className="training-dialog" tabIndex={-1}>
        <h2 id="training-join-title">加入课程</h2>
        <p>输入培训师提供的课程码。课程码与课堂互动码不同。</p>
        {joinError && <p role="alert" className="training-error">{joinError}</p>}
        <form onSubmit={joinCourse}>
          <label htmlFor="training-course-code">课程码</label>
          <input id="training-course-code" ref={inputRef} required autoComplete="off" value={courseCode} maxLength={100} onChange={event => setCourseCode(event.target.value)} placeholder="例如：ABC123" />
          <div className="training-dialog-actions">
            <button type="button" disabled={joining} className="training-action training-action--quiet" onClick={() => setJoinOpen(false)}>取消</button>
            <button type="submit" disabled={joining || !courseCode.trim()} className="training-action">{joining ? '加入中…' : '加入课程'}</button>
          </div>
        </form>
      </section>
    </ModalSurface>}
  </div>
}
