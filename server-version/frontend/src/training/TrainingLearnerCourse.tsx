import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import apiClient from '../api/client'
import { useCognitiveEnabled } from '../contexts/CapabilitiesContext'
import type { Assignment, Checkin, Course } from '../types'
import { loadCourseAssessments, type CourseAssessmentResult } from './courseAssessments'

type Section = 'assignments' | 'checkins' | 'assessments'
type SectionState<T> = { loading: boolean; error: string | null; rows: T[] }
const waiting = <T,>(): SectionState<T> => ({ loading: true, error: null, rows: [] })
const message = (error: unknown) => error instanceof Error ? error.message : '无法读取内容'

export default function TrainingLearnerCourse() {
  const { courseId } = useParams<{ courseId: string }>()
  const cognitiveEnabled = useCognitiveEnabled()
  const [section, setSection] = useState<Section>('assignments')
  const [epoch, setEpoch] = useState(0)
  const [course, setCourse] = useState<Course | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<SectionState<Assignment>>(waiting())
  const [checkins, setCheckins] = useState<SectionState<Checkin>>(waiting())
  const [assessments, setAssessments] = useState<CourseAssessmentResult | null>(null)
  const [assessmentsLoading, setAssessmentsLoading] = useState(false)
  const [assessmentRevision, setAssessmentRevision] = useState(0)

  // Keep current course data separate from previous course. Ignore stale loads.
  useEffect(() => {
    let alive = true
    if (!courseId) { setCourse(null); setCourseError('课程链接缺少必要信息'); setCourseLoading(false); return }
    const encoded = encodeURIComponent(courseId)
    setSection('assignments')
    setCourse(null)
    setCourseError(null)
    setCourseLoading(true)
    setAssignments(waiting())
    setCheckins(waiting())
    setAssessments(null)
    void Promise.all([
      (async () => {
        try {
          const res = await apiClient.get<Course>('/courses/' + encoded)
          if (res.code !== 0 || !res.data) throw new Error(res.message || '课程不可用')
          if (alive) setCourse(res.data)
        } catch (error) { if (alive) setCourseError(message(error)) }
        finally { if (alive) setCourseLoading(false) }
      })(),
      (async () => {
        try {
          const res = await apiClient.get<{ list: Assignment[] }>('/courses/' + encoded + '/assignments')
          if (res.code !== 0) throw new Error(res.message || '作业加载失败')
          if (alive) setAssignments({ loading: false, error: null, rows: res.data?.list || [] })
        } catch (error) { if (alive) setAssignments({ loading: false, error: message(error), rows: [] }) }
      })(),
      (async () => {
        try {
          const res = await apiClient.get<{ list: Checkin[] }>('/courses/' + encoded + '/checkins')
          if (res.code !== 0) throw new Error(res.message || '打卡加载失败')
          if (alive) setCheckins({ loading: false, error: null, rows: res.data?.list || [] })
        } catch (error) { if (alive) setCheckins({ loading: false, error: message(error), rows: [] }) }
      })(),
    ])
    return () => { alive = false }
  }, [courseId, epoch])

  useEffect(() => {
    if (!courseId || !course || course.id !== courseId || section !== 'assessments' || assessments) return
    let alive = true
    setAssessmentsLoading(true)
    void loadCourseAssessments(courseId, cognitiveEnabled).then(result => {
      if (alive) setAssessments(result)
    }).catch(error => {
      if (alive) setAssessments({ items: [], errors: [message(error)] })
    }).finally(() => { if (alive) setAssessmentsLoading(false) })
    return () => { alive = false }
  }, [courseId, course, section, assessments, assessmentRevision, cognitiveEnabled])

  // The capability check may finish after the course page first renders.
  // Re-discover available cognitive assignments when the authoritative flag changes.
  useEffect(() => { setAssessments(null) }, [cognitiveEnabled])

  const retry = () => { setEpoch(value => value + 1) }
  const retryAssessments = () => { setAssessments(null); setAssessmentRevision(value => value + 1) }

  return <div className="training-detail">
    <Link className="training-back" to="/student"><ArrowLeft size={16} aria-hidden="true" />返回我的课程</Link>
    {courseLoading || (course && course.id !== courseId) ? <p className="training-status" role="status">正在读取课程…</p>
      : courseError || !course ? <div className="training-message" role="alert">课程暂时不可用：{courseError || '无权访问这门课程'}<button type="button" onClick={retry}>重试</button></div>
        : <>
          <header className="training-detail-header">
            <p className="training-eyebrow">学员 · 课程学习</p>
            <h1>{course.title}</h1>
            {course.description && <p>{course.description}</p>}
          </header>
          <nav className="training-section-switch" aria-label="课程任务类别">
            {([
              ['assignments', '作业'], ['checkins', '打卡'], ['assessments', '测评'],
            ] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={section === value} onClick={() => setSection(value)}>{label}</button>)}
          </nav>

          {section === 'assignments' && <section className="training-detail-content" aria-label="课程作业">
            {assignments.loading ? <p role="status">正在读取作业…</p>
              : assignments.error ? <div role="alert">作业读取失败：{assignments.error}<button type="button" onClick={retry}>重试</button></div>
                : assignments.rows.length === 0 ? <p className="training-empty-small">目前没有布置作业。</p>
                  : <div className="training-item-list">{assignments.rows.map(task => {
                    const draft = task.mySubmission?.status === 'DRAFT'
                    const done = task.mySubmission?.status === 'SUBMITTED'
                      || task.mySubmission?.status === 'GRADED'
                      || Boolean(task.submitted && !task.mySubmission)
                    const expired = Boolean(task.deadline && Date.parse(task.deadline) < Date.now())
                    const state = done ? '已提交' : expired ? '已截止'
                      : draft ? '已保存草稿' : '待完成'
                    const action = done ? '查看提交' : expired ? '查看作业'
                      : draft ? '继续作业' : '完成作业'
                    return <article className="training-task-item" key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '请阅读作业要求后提交。'}</p><span>{state}</span></div>
                      <Link to={'/student/assignments/' + encodeURIComponent(task.id)} className="training-row-action">{action}<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>
                  })}</div>}
          </section>}
          {section === 'checkins' && <section className="training-detail-content" aria-label="课程打卡">
            {checkins.loading ? <p role="status">正在读取打卡…</p>
              : checkins.error ? <div role="alert">打卡读取失败：{checkins.error}<button type="button" onClick={retry}>重试</button></div>
                : checkins.rows.length === 0 ? <p className="training-empty-small">目前没有布置打卡。</p>
                  : <div className="training-item-list">{checkins.rows.map(task => {
                    const done = Boolean(task.submission || task.submitted)
                    const expired = Boolean(task.endTime && Date.parse(task.endTime) < Date.now())
                    return <article className="training-task-item" key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '按要求完成本次打卡。'}</p><span>{done ? '已打卡' : expired ? '已截止' : '待完成'}</span></div>
                      <Link to={'/student/checkins/' + encodeURIComponent(task.id)} className="training-row-action">{done ? '查看记录' : expired ? '查看打卡' : '去打卡'}<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>
                  })}</div>}
          </section>}
          {section === 'assessments' && <section className="training-detail-content" aria-label="课程测评">
            {assessmentsLoading || !assessments ? <p role="status">正在核对本课程的可用测评…</p>
              : <>
                  {assessments.errors.length > 0 && <div className="training-message training-message--compact" role="alert">
                    <p>部分测评暂时无法读取，已加载的内容仍可使用。</p>
                    {assessments.errors.map(error => <p key={error}>{error}</p>)}
                    <button type="button" onClick={retryAssessments}>重新加载测评</button>
                  </div>}
                  {assessments.items.length === 0 && assessments.errors.length === 0 && <p className="training-empty-small">培训师还没有向这门课程发布测评。</p>}
                  {assessments.items.length > 0 && <div className="training-item-list">{assessments.items.map(task =>
                    <article className="training-task-item" key={task.key}>
                      <div><span className="training-task-type">{task.typeLabel}</span><h2>{task.name}</h2><p>{task.description || '进入后可查看作答要求。'}</p><span>{task.status}</span></div>
                      <div className="training-task-actions">
                        {task.href ? <Link className="training-row-action" to={task.href}>{task.action}<ArrowRight size={16} aria-hidden="true" /></Link>
                          : <span className="training-task-disabled">{task.action}</span>}
                        {task.reportHref && <Link className="training-task-report" to={task.reportHref}>查看上次反馈</Link>}
                      </div>
                    </article>)}</div>}
                  <p className="training-science-note">测评是否可以开始、继续或查看反馈，以测评实际规则及当前授权为准。</p>
                </>}
          </section>}
        </>}
  </div>
}
