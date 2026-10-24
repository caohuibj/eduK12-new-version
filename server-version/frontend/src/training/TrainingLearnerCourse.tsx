import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'
import { useCognitiveEnabled } from '../contexts/CapabilitiesContext'
import type { ApiResponse, Assignment, Checkin, Course } from '../types'
import { loadCourseAssessments, type CourseAssessmentResult } from './courseAssessments'
import { learnerSection, withLearnerCourse } from './learnerNavigation'
import './training-learner-course.css'

type Section = 'assignments' | 'checkins' | 'assessments'
type SectionState<T> = { loading: boolean; error: string | null; rows: T[] }
const waiting = <T,>(): SectionState<T> => ({ loading: true, error: null, rows: [] })
const message = (error: unknown) => error instanceof Error ? error.message : '无法读取内容'
type CompletionFilter = 'all' | 'incomplete' | 'complete'
const assignmentDone = (task: Assignment) => task.mySubmission?.status === 'SUBMITTED'
  || task.mySubmission?.status === 'GRADED' || Boolean(task.submitted && !task.mySubmission)
const checkinDone = (task: Checkin) => Boolean(task.submission || task.submitted)
const matchesCompletion = (done: boolean, value: CompletionFilter) => value === 'all' || done === (value === 'complete')
function CompletionFilters({ value, total, completed, onChange }: {
  value: CompletionFilter; total: number; completed: number; onChange: (value: CompletionFilter) => void
}) {
  return <div className="training-completion-filter" role="group" aria-label="完成状态筛选">
    {([['all', '全部', total], ['incomplete', '未完成', total - completed], ['complete', '已完成', completed]] as const).map(([key, label, count]) =>
      <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{label}<span>{count}</span></button>)}
  </div>
}

type CourseRequests = {
  key: string
  course?: Promise<ApiResponse<Course>>
  assignments?: Promise<ApiResponse<{ list: Assignment[] }>>
  checkins?: Promise<ApiResponse<{ list: Checkin[] }>>
}

export default function TrainingLearnerCourse() {
  const { courseId } = useParams<{ courseId: string }>()
  const cognitiveEnabled = useCognitiveEnabled()
  const [search, setSearch] = useSearchParams()
  const section = learnerSection(search.get('section'))
  const setSection = (value: Section) => setSearch(previous => {
    const next = new URLSearchParams(previous)
    next.set('section', value)
    next.delete('completion')
    return next
  }, { replace: true })
  const completion: CompletionFilter = search.get('completion') === 'complete' ? 'complete' : search.get('completion') === 'incomplete' ? 'incomplete' : 'all'
  const setCompletion = (value: CompletionFilter) => setSearch(previous => {
    const next = new URLSearchParams(previous)
    if (value === 'all') next.delete('completion'); else next.set('completion', value)
    return next
  }, { replace: true })
  const taskHref = (target: string, taskSection: Section = 'assessments') =>
    withLearnerCourse(target, courseId ? { courseId, section: taskSection } : null)
  const [epoch, setEpoch] = useState(0)
  const [course, setCourse] = useState<Course | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<SectionState<Assignment>>(waiting())
  const [checkins, setCheckins] = useState<SectionState<Checkin>>(waiting())
  const [assessments, setAssessments] = useState<CourseAssessmentResult | null>(null)
  const [assessmentsLoading, setAssessmentsLoading] = useState(false)
  const [assessmentRevision, setAssessmentRevision] = useState(0)
  const requests = useRef<CourseRequests>({ key: '' })
  const assessmentRequest = useRef<{ key: string; promise: Promise<CourseAssessmentResult> } | null>(null)

  // Keep current course data separate from previous course. Ignore stale loads.
  useEffect(() => {
    let alive = true
    if (!courseId) { setCourse(null); setCourseError('课程链接缺少必要信息'); setCourseLoading(false); return }
    const encoded = encodeURIComponent(courseId)
    const key = `${courseId}:${epoch}`
    if (requests.current.key !== key) {
      requests.current = { key }
      setCourse(null)
      setCourseError(null)
      setCourseLoading(true)
      setAssignments(waiting())
      setCheckins(waiting())
      setAssessments(null)
    }
    const current = requests.current
    // Retain each request only for this mounted course/retry generation. Opening
    // a task tab starts its first read; switching tabs never starts it twice.
    void Promise.all([
      (async () => {
        try {
          const res = await (current.course ??= apiClient.get<Course>('/courses/' + encoded))
          if (res.code !== 0 || !res.data) throw new Error(res.message || '课程不可用')
          if (alive) setCourse(res.data)
        } catch (error) { if (alive) setCourseError(message(error)) }
        finally { if (alive) setCourseLoading(false) }
      })(),
      (async () => {
        if (section !== 'assignments') return
        try {
          const res = await (current.assignments ??= apiClient.get<{ list: Assignment[] }>('/courses/' + encoded + '/assignments'))
          if (res.code !== 0) throw new Error(res.message || '练习加载失败')
          if (alive) setAssignments({ loading: false, error: null, rows: res.data?.list || [] })
        } catch (error) { if (alive) setAssignments({ loading: false, error: message(error), rows: [] }) }
      })(),
      (async () => {
        if (section !== 'checkins') return
        try {
          const res = await (current.checkins ??= apiClient.get<{ list: Checkin[] }>('/courses/' + encoded + '/checkins'))
          if (res.code !== 0) throw new Error(res.message || '打卡加载失败')
          if (alive) setCheckins({ loading: false, error: null, rows: res.data?.list || [] })
        } catch (error) { if (alive) setCheckins({ loading: false, error: message(error), rows: [] }) }
      })(),
    ])
    return () => { alive = false }
  }, [courseId, epoch, section])

  useEffect(() => {
    if (!courseId || !course || course.id !== courseId || section !== 'assessments' || assessments) return
    let alive = true
    setAssessmentsLoading(true)
    // Reuse the in-flight discovery when a learner leaves and returns to this
    // tab. Keep it local to this mount and invalidate on course, retry or
    // capability changes; no cross-session or durable availability cache.
    const key = JSON.stringify([courseId, epoch, assessmentRevision, cognitiveEnabled])
    if (assessmentRequest.current?.key !== key) {
      assessmentRequest.current = { key, promise: loadCourseAssessments(courseId, cognitiveEnabled) }
    }
    void assessmentRequest.current.promise.then(result => {
      if (!alive) return
      // Publish data and its settled loading state together. Updating assessments
      // invalidates this effect, so a later finally callback can be cancelled.
      setAssessmentsLoading(false)
      setAssessments(result)
    }).catch(error => {
      if (!alive) return
      setAssessmentsLoading(false)
      setAssessments({ items: [], errors: [message(error)] })
    })
    return () => { alive = false }
  }, [courseId, course, section, assessments, epoch, assessmentRevision, cognitiveEnabled])

  // The capability check may finish after the course page first renders.
  // Re-discover available cognitive assignments when the authoritative flag changes.
  useEffect(() => { setAssessments(null) }, [cognitiveEnabled])

  const retry = () => { setEpoch(value => value + 1) }
  const retryAssessments = () => { setAssessments(null); setAssessmentRevision(value => value + 1) }

  const assignmentRows = assignments.rows.filter(task => matchesCompletion(assignmentDone(task), completion))
  const checkinRows = checkins.rows.filter(task => matchesCompletion(checkinDone(task), completion))
  const assessmentRows = assessments?.items.filter(task => matchesCompletion(task.completed === true, completion)) ?? []
  const filteredEmpty = (label: string) => `当前没有${completion === 'complete' ? '已完成' : '未完成'}的${label}。`

  return <div className="training-detail training-learner-course">
    <Link className="training-back" to="/student"><ArrowLeft size={16} aria-hidden="true" />我的课程</Link>
    {courseLoading || (course && course.id !== courseId) ? <p className="training-status" role="status">正在读取课程…</p>
      : courseError || !course ? <div className="training-message" role="alert">课程暂时不可用：{courseError || '无权访问这门课程'}<button type="button" onClick={retry}>重试</button></div>
        : <>
          <header className="training-detail-header">
            <h1>{course.title}</h1>
          </header>
          <div className={`training-course-layout ${course.description ? '' : 'training-course-layout--full'}`}><div className="training-course-work">
          <nav className="training-section-switch" aria-label="课程任务类别">
            {([
              ['assignments', '练习'], ['checkins', '打卡'], ['assessments', '测评'],
            ] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={section === value} onClick={() => setSection(value)}>{label}</button>)}
          </nav>

          {section === 'assignments' && <section className="training-detail-content" aria-label="课程练习">
            {!assignments.loading && !assignments.error && <CompletionFilters value={completion} total={assignments.rows.length} completed={assignments.rows.filter(assignmentDone).length} onChange={setCompletion} />}
            {assignments.loading ? <p role="status">正在读取练习…</p>
              : assignments.error ? <div role="alert">练习读取失败：{assignments.error}<button type="button" onClick={retry}>重试</button></div>
                : assignments.rows.length === 0 ? <p className="training-empty-small">目前没有布置练习。</p>
                  : assignmentRows.length === 0 ? <p className="training-empty-small">{filteredEmpty('练习')}</p>
                  : <div className="training-item-list">{assignmentRows.map(task => {
                    const draft = task.mySubmission?.status === 'DRAFT'
                    const done = assignmentDone(task)
                    const expired = Boolean(task.deadline && Date.parse(task.deadline) < Date.now())
                    const state = done ? '已提交' : expired ? '已截止'
                      : draft ? '已保存草稿' : '待完成'
                    const action = done ? '查看提交' : expired ? '查看练习'
                      : draft ? '继续练习' : '完成练习'
                    return <article className="training-task-item" data-completion={done ? 'complete' : 'incomplete'} key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '请阅读练习要求后提交。'}</p><span className="training-task-state">{state}</span></div>
                      <Link to={taskHref('/student/assignments/' + encodeURIComponent(task.id), 'assignments')} className="training-row-action">{action}<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>
                  })}</div>}
          </section>}
          {section === 'checkins' && <section className="training-detail-content" aria-label="课程打卡">
            {!checkins.loading && !checkins.error && <CompletionFilters value={completion} total={checkins.rows.length} completed={checkins.rows.filter(checkinDone).length} onChange={setCompletion} />}
            {checkins.loading ? <p role="status">正在读取打卡…</p>
              : checkins.error ? <div role="alert">打卡读取失败：{checkins.error}<button type="button" onClick={retry}>重试</button></div>
                : checkins.rows.length === 0 ? <p className="training-empty-small">目前没有布置打卡。</p>
                  : checkinRows.length === 0 ? <p className="training-empty-small">{filteredEmpty('打卡')}</p>
                  : <div className="training-item-list">{checkinRows.map(task => {
                    const done = checkinDone(task)
                    const expired = Boolean(task.endTime && Date.parse(task.endTime) < Date.now())
                    return <article className="training-task-item" data-completion={done ? 'complete' : 'incomplete'} key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '按要求完成本次打卡。'}</p><span className="training-task-state">{done ? '已打卡' : expired ? '已截止' : '待完成'}</span></div>
                      <Link to={taskHref('/student/checkins/' + encodeURIComponent(task.id), 'checkins')} className="training-row-action">{done ? '查看记录' : expired ? '查看打卡' : '去打卡'}<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>
                  })}</div>}
          </section>}
          {section === 'assessments' && <section className="training-detail-content" aria-label="课程测评">
            {assessmentsLoading || !assessments ? <p role="status">正在核对本课程的可用测评…</p>
              : <>
                  <CompletionFilters value={completion} total={assessments.items.length} completed={assessments.items.filter(task => task.completed === true).length} onChange={setCompletion} />
                  {assessments.errors.length > 0 && <div className="training-message training-message--compact" role="alert">
                    <p>部分测评暂时无法读取，已加载的内容仍可使用。</p>
                    {assessments.errors.map(error => <p key={error}>{error}</p>)}
                    <button type="button" onClick={retryAssessments}>重新加载测评</button>
                  </div>}
                  {assessments.items.length === 0 && assessments.errors.length === 0 && <p className="training-empty-small">培训师还没有向这门课程发布测评。</p>}
                  {assessments.items.length > 0 && assessmentRows.length === 0 && <p className="training-empty-small">{filteredEmpty('测评')}</p>}
                  {assessmentRows.length > 0 && <div className="training-item-list">{assessmentRows.map(task =>
                    <article className="training-task-item" data-completion={task.completed === true ? 'complete' : 'incomplete'} key={task.key}>
                      <div><span className="training-task-type">{task.typeLabel}</span><h2>{task.name}</h2><p>{task.description || '进入后可查看作答要求。'}</p><span className="training-task-state">{task.status}</span>{task.taskSatisfactionLabel && task.taskSatisfactionLabel !== task.status && <p className="training-task-satisfaction">{task.taskSatisfactionLabel}</p>}</div>
                      <div className="training-task-actions">
                        {task.href ? <Link className="training-row-action" to={taskHref(task.href)}>{task.action}<ArrowRight size={16} aria-hidden="true" /></Link>
                          : <span className="training-task-disabled">{task.action}</span>}
                        {task.reportHref && <Link className="training-task-report" to={taskHref(task.reportHref)}>查看上次反馈</Link>}
                      </div>
                    </article>)}</div>}
                  <p className="training-science-note">测评是否可以开始、继续或查看反馈，以测评实际规则及当前授权为准。</p>

        </>}
          </section>}
</div>{course.description && <aside className="training-course-sidebar"><section className="training-side-panel"><h2>课程说明</h2><p>{course.description}</p></section></aside>}</div>
        </>}
  </div>
}
