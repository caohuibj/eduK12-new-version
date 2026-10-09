import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Copy } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import apiClient from '../api/client'
import { internalReturnTo } from '../components/app-shell/access'
import { useAuth } from '../contexts/AuthContext'
import { useCognitiveEnabled } from '../contexts/CapabilitiesContext'
import TrainingCourseSettings from './TrainingCourseSettings'
import type { Course, Assignment, Checkin } from '../types'

type Section = 'assignments' | 'checkins' | 'assessments'
type CourseAssessment = {
  id: string; key: string; kind: string; typeLabel: string
  name: string; description: string | null; status: string
  unitCount: number | null; unitLabel: string | null; manageHref: string | null
}
type Collection<T> = { rows: T[]; loading: boolean; error: string | null }
const pending = <T,>(): Collection<T> => ({ rows: [], loading: true, error: null })
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '加载失败'

export default function TrainingTrainerCourse() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const cognitiveEnabled = useCognitiveEnabled()
  const [section, setSection] = useState<Section>('assignments')
  const [revision, setRevision] = useState(0)
  const [course, setCourse] = useState<Course | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Collection<Assignment>>(pending())
  const [checkins, setCheckins] = useState<Collection<Checkin>>(pending())
  const [assessments, setAssessments] = useState<Collection<CourseAssessment>>(pending())
  const [codeNotice, setCodeNotice] = useState('')

  useEffect(() => {
    let active = true
    if (!courseId) { setCourse(null); setCourseLoading(false); setCourseError('课程链接无效'); return }
    const id = encodeURIComponent(courseId)
    setCourseLoading(true)
    setCourseError(null)
    setCourse(previous => previous?.id === courseId ? previous : null)
    setCodeNotice('')
    setAssignments(pending<Assignment>())
    setCheckins(pending<Checkin>())
    setAssessments(pending<CourseAssessment>())
    const load = async <T,>(url: string, setter: (value: Collection<T>) => void) => {
      try {
        const response = await apiClient.get<{ list: T[] }>(url)
        if (response.code !== 0) throw new Error(response.message || '读取失败')
        if (active) setter({ rows: response.data?.list || [], loading: false, error: null })
      } catch (error) { if (active) setter({ rows: [], loading: false, error: errorMessage(error) }) }
    }
    void Promise.all([
      (async () => {
        try {
          const res = await apiClient.get<Course>('/courses/' + id)
          if (res.code !== 0 || !res.data) throw new Error(res.message || '课程不可用')
          if (active) setCourse(res.data)
        } catch (error) { if (active) setCourseError(errorMessage(error)) }
        finally { if (active) setCourseLoading(false) }
      })(),
      load('/courses/' + id + '/assignments', setAssignments),
      load('/courses/' + id + '/checkins', setCheckins),
      load('/courses/' + id + '/training-assessments', setAssessments),
    ])
    return () => { active = false }
  }, [courseId, revision, cognitiveEnabled])

  const owned = Boolean(course && course.id === courseId && user && course.creatorId === user.id)
  const retry = () => setRevision(value => value + 1)
  const code = course?.courseCode || ''
  const encoded = courseId ? encodeURIComponent(courseId) : ''
  async function copyCode() {
    if (!code) return
    if (!navigator.clipboard?.writeText) {
      setCodeNotice('当前设备无法自动复制，可手动选中课程码。')
      return
    }
    try { await navigator.clipboard.writeText(code); setCodeNotice('课程码已复制。') }
    catch { setCodeNotice('复制失败，请手动选中课程码。') }
  }
  const displayedAssessments = assessments.rows.filter(item => cognitiveEnabled || item.kind !== 'COGNITIVE')

  return <div className="training-detail training-trainer-course">
    <Link to="/dashboard" className="training-back"><ArrowLeft size={16} aria-hidden="true" />我的课程</Link>
    {(courseLoading && !course) || (course && course.id !== courseId) ? <p role="status" className="training-status">正在读取课程…</p>
      : courseError || !course ? <div role="alert" className="training-message">无法读取课程：{courseError || '请确认课程状态'}<button type="button" onClick={retry}>重试</button></div>
        : !owned ? <div role="alert" className="training-message">当前账号不是这门课程的创建者，无法在培训版管理此课程。<Link to="/dashboard">我的课程</Link></div>
          : <>
            <header className="training-detail-header">
              <h1>{course.title}</h1>
              <div className="training-course-meta">
                <span>{course.studentCount ?? 0} 名学员</span>
                <span>课程状态：{course.status === 'PUBLISHED' ? '已发布' : course.status === 'DRAFT' ? '草稿' : '已完结'}</span>
              </div>
              {codeNotice && <p role="status" className="training-code-notice">{codeNotice}</p>}

              <div className="training-course-code-panel"><small>课程码 · 邀请学员</small><div><strong>{code}</strong><button type="button" onClick={() => void copyCode()}><Copy size={16} aria-hidden="true" />复制</button></div></div>
            </header>
            <div className="training-mobile-course-actions"><Link to={'/courses/' + encoded + '/students'}>管理学员</Link><Link to={'/assessment-workbench?courseId=' + encoded}>培训结果</Link><a href="#training-course-settings">课程设置 ↓</a></div>
            <div className="training-course-layout"><div className="training-course-work">
            <nav className="training-section-switch" aria-label="课程管理内容">
              {([
                ['assignments', '作业'], ['checkins', '打卡'], ['assessments', '测评'],
              ] as const).map(([value, label]) =>
                <button key={value} type="button" aria-pressed={section === value} onClick={() => setSection(value)}>{label}</button>)}
            </nav>

            {section === 'assignments' && <section className="training-detail-content" aria-label="课程作业管理">
              <div className="training-section-action"><Link to={'/assignments?create=true&courseId=' + encoded} className="training-action">＋ 发布作业</Link></div>
              {assignments.loading ? <p role="status">正在读取作业…</p> : assignments.error ? <div role="alert">读取作业失败：{assignments.error}<button type="button" onClick={retry}>重试</button></div>
                : assignments.rows.length === 0 ? <p className="training-empty-small">还没有布置作业。</p>
                  : <div className="training-item-list">{assignments.rows.map(task =>
                    <article className="training-task-item" key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '课程作业'}</p><span>{task.status === 'PUBLISHED' ? '已发布' : '草稿'}</span></div>
                      <Link to={'/assignments?id=' + encodeURIComponent(task.id)} className="training-row-action">查看管理<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>)}</div>}
            </section>}

            {section === 'checkins' && <section className="training-detail-content" aria-label="课程打卡管理">
              <div className="training-section-action"><Link to={'/checkins?create=true&courseId=' + encoded} className="training-action">＋ 发布打卡</Link></div>
              {checkins.loading ? <p role="status">正在读取打卡…</p> : checkins.error ? <div role="alert">读取打卡失败：{checkins.error}<button type="button" onClick={retry}>重试</button></div>
                : checkins.rows.length === 0 ? <p className="training-empty-small">还没有布置打卡。</p>
                  : <div className="training-item-list">{checkins.rows.map(task =>
                    <article className="training-task-item" key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '课程打卡'}</p><span>{task.status === 'DRAFT' ? '草稿' : '已发布'}</span></div>
                      <Link to={'/checkins?id=' + encodeURIComponent(task.id)} className="training-row-action">查看管理<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>)}</div>}
            </section>}

            {section === 'assessments' && <section className="training-detail-content" aria-label="课程测评管理">
              <div className="training-section-action training-assessment-shortcuts">
                <Link to={'/questionnaire-products/new?courseId=' + encoded} className="training-action">布置组合测评</Link>
                {cognitiveEnabled && <Link to={'/cognitive-assignments?create=true&courseId=' + encoded} className="training-action training-action--quiet">布置认知任务</Link>}
                <Link to="/questionnaires" className="training-action training-action--quiet">已有测评</Link>
              </div>
              <p className="training-science-note">只可发布当前拥有使用权且满足内容资格的测评，资源发布和报告披露仍由平台规则控制。</p>
              {assessments.error && <div className="training-message training-message--compact" role="alert">
                <p>当前课程测评清单暂时无法读取：{assessments.error}</p>
                <button type="button" onClick={retry}>重新加载测评</button>
              </div>}
              {assessments.loading ? <p role="status">正在核对本课程已发布的测评…</p>
                : assessments.error ? null
                  : displayedAssessments.length === 0
                    ? <p className="training-empty-small">这门课程尚未发布测评。可从上方选择已授权资源。</p>
                    : <div className="training-item-list">{displayedAssessments.map(task => {
                      const safeHref = internalReturnTo(task.manageHref)
                      return <article key={task.key} className="training-task-item">
                        <div>
                          <span className="training-task-type">{task.typeLabel}</span>
                          <h2>{task.name}</h2>
                          <p>{task.description || (task.unitCount === null ? '已发布的独立认知任务' : `${task.unitCount} ${task.unitLabel || '测评单元'}`)}</p>
                          <span>已发布 · 按课程授权</span>
                        </div>
                        {safeHref ? <Link to={safeHref} className="training-row-action">管理测评<ArrowRight size={16} aria-hidden="true" /></Link>
                          : <span className="training-task-disabled">由资源创建者管理</span>}
                      </article>
                    })}</div>}
            </section>}
</div><aside className="training-course-sidebar"><section className="training-side-panel"><h2>课程管理</h2>              <div className="training-trainer-shortcuts">
                <Link to={'/courses/' + encoded + '/students'}>管理学员 <ArrowRight size={15} aria-hidden="true" /></Link>
                <Link to={'/assessment-workbench?courseId=' + encoded}>查看培训结果 <ArrowRight size={15} aria-hidden="true" /></Link>
              </div></section><section className="training-side-panel" id="training-course-settings"><h2>课程说明</h2><p>{course.description || '管理本课程的作业、打卡与测评。'}</p><TrainingCourseSettings course={course} onUpdated={retry} /></section></aside></div>
          </>}
  </div>
}
