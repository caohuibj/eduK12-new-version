import { useRef, useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, Check, KeyRound, ListChecks, LoaderCircle, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCursorList } from '../hooks/useCursorList'
import apiClient from '../api/client'
import ModalSurface from '../components/shared-ui/ModalSurface'
import type { Course } from '../types'
import './training-learner-home.css'

/** Course-first training home. The generic STUDENT homepage is unchanged. */
export default function TrainingLearnerHome() {
  const { user } = useAuth()
  const { list: courses, loading, error: loadError, refresh, more, hasMore } = useCursorList<Course>('/courses/my')
  const [mutationNotice, setMutationNotice] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [courseCode, setCourseCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  return <div className="training-home training-learner-home">
    <header className="training-home-header learner-home-welcome">
      <div className="learner-welcome-copy">
        <p className="training-eyebrow">我的学习空间</p>
        <h1>你好，{user?.nickname || user?.username || '学员'}。</h1>
        <p className="training-home-subtitle">从一门课程开始，让每一次学习都有收获。</p>
        <button type="button" className="training-action" onClick={() => { setJoinError(''); setJoinOpen(true) }}><Plus size={17} aria-hidden="true" />加入课程</button>
      </div>
      <div className="learner-welcome-art" aria-hidden="true"><span>拾级<br />而上</span></div>
    </header>

    {mutationNotice && <p className="training-message learner-home-notice" role="status"><Check size={18} aria-hidden="true" />{mutationNotice}</p>}
    <div className="learner-home-layout">
      <section className="training-course-section" aria-labelledby="learner-courses">
        <div className="training-section-header">
          <div><h2 id="learner-courses">我的课程</h2><p>选择课程，查看学习任务。</p></div>
          {!loading && !loadError && <span className="learner-course-count">{hasMore ? `已加载 ${courses.length} 门` : `${courses.length} 门课程`}</span>}
        </div>
        {loading && courses.length === 0 ? <p role="status" className="training-status learner-home-state"><LoaderCircle size={22} aria-hidden="true" />正在读取课程…</p>
          : loadError && courses.length === 0 ? <div className="training-message learner-home-state learner-home-error" role="alert"><BookOpen size={28} aria-hidden="true" /><h3>课程暂时无法显示</h3><p>{loadError}</p><button type="button" className="training-action training-action--quiet" onClick={() => void refresh()}>重试</button></div>
          : courses.length === 0 ? <div className="training-empty learner-home-state"><span className="learner-empty-icon"><BookOpen size={29} aria-hidden="true" /></span><h3>还没有加入课程</h3><p>向培训师获取课程码，加入后即可查看学习任务。</p><button type="button" className="training-action training-action--quiet" onClick={() => setJoinOpen(true)}>输入培训师提供的课程码 <ArrowRight size={16} aria-hidden="true" /></button></div>
          : <div className={`training-course-list ${courses.length === 1 ? 'training-course-list--single' : ''}`}>{courses.map(course =>
            <Link key={course.id} to={`/student/courses/${encodeURIComponent(course.id)}`} className="training-course-item">
              <span className="training-course-cover" aria-hidden="true"><span><BookOpen size={18} />课程</span></span>
              <div className="training-course-text">
                <span className="learner-enrolled"><Check size={12} aria-hidden="true" />已加入</span>
                <h3>{course.title}</h3>
                <small title={course.description || undefined}>{course.description || '进入课程，查看练习、打卡与测评'}</small>
                <span className="training-course-card-bottom"><span>进入学习</span><ArrowRight size={17} aria-hidden="true" /></span>
              </div>
            </Link>)}</div>}
        {courses.length > 0 && loadError && <p role="alert" className="learner-home-partial-error">{loadError}</p>}
        {hasMore && <div className="training-load-more"><button type="button" className="training-action training-action--quiet" disabled={loading} onClick={() => void more()}>{loading ? '加载中…' : '加载更多课程'}</button></div>}
      </section>
      <aside className="learner-home-guide" aria-labelledby="learner-guide-title">
        <div className="learner-guide-heading"><span>循序而进</span><h2 id="learner-guide-title">开始你的学习</h2></div>
        <ol>
          <li><span className="learner-guide-icon"><KeyRound size={18} aria-hidden="true" /></span><div><h3>加入课程</h3><p>输入培训师提供的课程码。</p></div></li>
          <li><span className="learner-guide-icon"><BookOpen size={18} aria-hidden="true" /></span><div><h3>进入课程</h3><p>选择课程，查看学习安排。</p></div></li>
          <li><span className="learner-guide-icon"><ListChecks size={18} aria-hidden="true" /></span><div><h3>完成任务</h3><p>按要求完成练习、打卡与测评。</p></div></li>
        </ol>
        <p className="learner-guide-note">学习，始于当下。</p>
      </aside>
    </div>

    <p className="training-bottom-line">日日有所学，终将有所见。</p>

    {joinOpen && <ModalSurface open={joinOpen} onClose={() => { if (!joining) setJoinOpen(false) }} initialFocusRef={inputRef} className="training-dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="training-join-title" aria-describedby="training-join-description" className="training-dialog learner-join-dialog" tabIndex={-1}>
        <div className="learner-join-heading"><span className="learner-guide-icon"><KeyRound size={22} aria-hidden="true" /></span><h2 id="training-join-title">加入课程</h2></div>
        <p id="training-join-description">输入培训师提供的课程码。课程码与课堂互动码不同。</p>
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
