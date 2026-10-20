import TrainingCourseCode from './TrainingCourseCode'
import { CatalogFilters, CatalogPagination } from './TrainingCatalogControls'
import { useCatalogQuery } from './useCatalogQuery'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'
import TrainingCourseAssessments, { type CourseAssessment } from './TrainingCourseAssessments'
import { useAuth } from '../contexts/AuthContext'
import TrainingCourseSettings from './TrainingCourseSettings'
import TrainingCourseAnalysis from './TrainingCourseAnalysis'
import type { Course, Assignment, Checkin } from '../types'

type Section = 'assignments' | 'checkins' | 'assessments' | 'analysis' | 'management'
type Collection<T> = { rows: T[]; loading: boolean; error: string | null }
const pending = <T,>(): Collection<T> => ({ rows: [], loading: true, error: null })
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '加载失败'

export default function TrainingTrainerCourse() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const [query,setQuery] = useSearchParams()
  const selected = query.get('section')
  const section: Section = selected === 'assessments' || selected === 'analysis' || selected === 'management' || selected === 'checkins' ? selected : 'assignments'
  const setSection = (value: Section) => setQuery(previous=>{const next=new URLSearchParams(previous);next.set('section',value);return next},{replace:true})
  const catalog = useCatalogQuery(section+'_')
  const filtered=Boolean(catalog.selection.search||catalog.selection.tags||catalog.selection.from||catalog.selection.to)
  const [collectionTotal,setCollectionTotal] = useState(0)
  const returnContext = '&returnTo='+encodeURIComponent('/courses/'+encodeURIComponent(courseId||'')+'/detail?'+query.toString())
  const [revision, setRevision] = useState(0)
  const [course, setCourse] = useState<Course | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Collection<Assignment>>(pending())
  const [checkins, setCheckins] = useState<Collection<Checkin>>(pending())
  const [assessments, setAssessments] = useState<Collection<CourseAssessment>>(pending())

  useEffect(() => {
    let active = true
    if (!courseId) { setCourse(null); setCourseLoading(false); setCourseError('课程链接无效'); return }
    const id = encodeURIComponent(courseId)
    setCourseLoading(true)
    setCourseError(null)
    setCourse(previous => previous?.id === courseId ? previous : null)
    void (async () => {
        try {
          const res = await apiClient.get<Course>('/courses/' + id)
          if (res.code !== 0 || !res.data) throw new Error(res.message || '课程不可用')
          if (active) setCourse(res.data)
        } catch (error) { if (active) setCourseError(errorMessage(error)) }
        finally { if (active) setCourseLoading(false) }
      })()
    return () => { active = false }
  }, [courseId, revision])

  const owned = Boolean(course && course.id === courseId && user && course.creatorId === user.id)
  useEffect(() => {
    let active=true
    if(!owned || !courseId || (section==='analysis'||section==='management')) return
    const setter = section==='assignments'?setAssignments:section==='checkins'?setCheckins:setAssessments
    setter({rows:[],loading:true,error:null})
    setCollectionTotal(0)
    const url=section==='assessments'?'/courses/'+encodeURIComponent(courseId)+'/training-assessments?includeManaged=true&view=summary&'+catalog.params
      :'/'+section+'?view=summary&courseId='+encodeURIComponent(courseId)+'&'+catalog.params
    void apiClient.get<{list:any[];total:number}>(url).then(response=>{
      if(response.code!==0)throw Error(response.message||'读取失败')
      if(active){setter({rows:response.data.list,loading:false,error:null});setCollectionTotal(response.data.total??response.data.list.length)}
    }).catch(error=>{if(active)setter({rows:[],loading:false,error:errorMessage(error)})})
    return()=>{active=false}
  },[owned,courseId,section,catalog.params,revision])
  const retry = () => setRevision(value => value + 1)
  const encoded = courseId ? encodeURIComponent(courseId) : ''

  return <div className="training-detail training-trainer-course">
    <Link to="/dashboard" className="training-back"><ArrowLeft size={16} aria-hidden="true" />我的课程</Link>
    {(courseLoading && !course) || (course && course.id !== courseId) ? <p role="status" className="training-status">正在读取课程…</p>
      : courseError || !course ? <div role="alert" className="training-message">无法读取课程：{courseError || '请确认课程状态'}<button type="button" onClick={retry}>重试</button></div>
        : !owned ? <div role="alert" className="training-message">当前账号不是这门课程的创建者，无法在培训版管理此课程。<Link to="/dashboard">我的课程</Link></div>
          : <>
            <header className="training-detail-header">
              <div className="training-course-title-row"><h1>{course.title}</h1><TrainingCourseCode key={course.id+course.courseCode} code={course.courseCode} title={course.title}/></div>
              <div className="training-course-meta">
                <span>{course.studentCount ?? 0} 名学员</span>
                <span>课程状态：{course.status === 'PUBLISHED' ? '已发布' : course.status === 'DRAFT' ? '草稿' : '已完结'}</span>
              </div>
            </header>
            <div className="training-course-layout training-course-layout--full"><div className="training-course-work">
            <nav className="training-section-switch" aria-label="课程管理内容">
              {([
                ['assignments', '作业'], ['checkins', '打卡'], ['assessments', '测评'], ['analysis', '信息统计'], ['management','课程管理'],
              ] as const).map(([value, label]) =>
                <button key={value} type="button" className="training-section-tab" aria-pressed={section === value} onClick={() => setSection(value)}>{label}</button>)}
            </nav>

            {section !== 'analysis' && section !== 'management' && <CatalogFilters key={section+catalog.stateKey} selection={catalog.selection} onApply={catalog.apply} deadline={section!=='assessments'} label={section==='assignments'?'作业':section==='checkins'?'打卡':'测评'}/>}
            {section === 'assignments' && <section className="training-detail-content" aria-label="课程作业管理">
              <div className="training-section-action"><Link to={'/assignments?create=true&courseId=' + encoded + returnContext} className="training-action">＋ 发布作业</Link></div>
              {assignments.loading ? <p role="status">正在读取作业…</p> : assignments.error ? <div role="alert">读取作业失败：{assignments.error}<button type="button" onClick={retry}>重试</button></div>
                : assignments.rows.length === 0 ? <p className="training-empty-small">{filtered?'没有符合当前条件的作业。':'还没有布置作业。'}</p>
                  : <div className="training-item-list">{assignments.rows.map(task =>
                    <article className="training-task-item" key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '课程作业'}</p><span>{task.status === 'PUBLISHED' ? '已发布' : '草稿'}</span></div>
                      <Link to={'/assignments?id=' + encodeURIComponent(task.id) + '&courseId=' + encoded + returnContext} className="training-row-action">查看管理<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>)}</div>}
            </section>}

            {section === 'checkins' && <section className="training-detail-content" aria-label="课程打卡管理">
              <div className="training-section-action"><Link to={'/checkins?create=true&courseId=' + encoded + returnContext} className="training-action">＋ 发布打卡</Link></div>
              {checkins.loading ? <p role="status">正在读取打卡…</p> : checkins.error ? <div role="alert">读取打卡失败：{checkins.error}<button type="button" onClick={retry}>重试</button></div>
                : checkins.rows.length === 0 ? <p className="training-empty-small">{filtered?'没有符合当前条件的打卡。':'还没有布置打卡。'}</p>
                  : <div className="training-item-list">{checkins.rows.map(task =>
                    <article className="training-task-item" key={task.id}>
                      <div><h2>{task.title}</h2><p>{task.description || '课程打卡'}</p><span>{task.status === 'DRAFT' ? '草稿' : '已发布'}</span></div>
                      <Link to={'/checkins?id=' + encodeURIComponent(task.id) + '&courseId=' + encoded + returnContext} className="training-row-action">查看管理<ArrowRight size={16} aria-hidden="true" /></Link>
                    </article>)}</div>}
            </section>}

            {section === 'assessments' && <TrainingCourseAssessments key={course.id} course={course} actorId={user?.id||''}
              rows={assessments.rows} loading={assessments.loading} error={assessments.error} onRetry={retry} filtered={filtered}/>}
            {section !== 'analysis' && section !== 'management' && <CatalogPagination selection={catalog.selection} onApply={catalog.apply} total={collectionTotal} loading={section==='assignments'?assignments.loading:section==='checkins'?checkins.loading:assessments.loading} label={section==='assignments'?'作业':section==='checkins'?'打卡':'测评'}/>}
            {section === 'analysis' && <TrainingCourseAnalysis key={course.id} courseId={course.id} />}

            {section === 'management' && <section className="training-course-management" aria-label="课程管理设置"><header><h2>课程管理</h2><p>管理学员、查看课程说明，或调整报名与课程状态。</p></header><div className="training-management-panels"><section className="training-side-panel"><h3>学员与测评</h3><div className="training-trainer-shortcuts"><Link to={'/courses/'+encoded+'/students'}>管理学员 <ArrowRight size={15} aria-hidden="true"/></Link><button type="button" onClick={()=>setSection('assessments')}>测评与结果 <ArrowRight size={15} aria-hidden="true"/></button></div></section><section className="training-side-panel"><h3>课程说明与设置</h3><p>{course.description||'管理本课程的作业、打卡与测评。'}</p><TrainingCourseSettings course={course} onUpdated={retry}/></section></div></section>}
            </div></div>
          </>}
  </div>
}
