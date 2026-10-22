import './training-course-overview.css'
import TrainingCourseCode from './TrainingCourseCode'
import TrainingCourseTabs from './TrainingCourseTabs'
import { CatalogFilters, CatalogPagination } from './TrainingCatalogControls'
import { useCatalogQuery } from './useCatalogQuery'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'
import TrainingCourseAssessments, { type CourseAssessment } from './TrainingCourseAssessments'
import { useAuth } from '../contexts/AuthContext'
import TrainingCourseSettings from './TrainingCourseSettings'
import { COURSE_ANALYSIS_ENABLED, resolveCourseSection, type CourseSection } from './courseNavigation'
import type { Course } from '../types'

const CourseAssignmentWorkspace = lazy(() => import('../pages/AssignmentList'))
const CourseCheckinWorkspace = lazy(() => import('../pages/CheckinList'))
const TrainingCourseAnalysis = lazy(() => import('./TrainingCourseAnalysis'))
type Section = CourseSection
type Collection<T> = { rows: T[]; loading: boolean; error: string | null }
const pending = <T,>(): Collection<T> => ({ rows: [], loading: true, error: null })
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '加载失败'

export default function TrainingTrainerCourse() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const [query,setQuery] = useSearchParams()
  const selected = query.get('section')
  const section = resolveCourseSection(selected)
  const setSection = (value: Section) => setQuery(previous=>{const next=new URLSearchParams(previous);next.set('section',value);return next},{replace:true})
  useEffect(() => {
    if (selected === 'analysis' && !COURSE_ANALYSIS_ENABLED) {
      setQuery(previous => { const next = new URLSearchParams(previous); next.set('section', 'assessments'); return next }, { replace: true })
    }
  }, [selected, setQuery])
  const catalog = useCatalogQuery(section+'_')
  const filtered=Boolean(catalog.selection.search||catalog.selection.tags||catalog.selection.from||catalog.selection.to)
  const [collectionTotal,setCollectionTotal] = useState(0)
  const [revision, setRevision] = useState(0)
  const [course, setCourse] = useState<Course | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
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
    if(!owned || !courseId || section!=='assessments') return
    const setter = setAssessments
    setter({rows:[],loading:true,error:null})
    setCollectionTotal(0)
    const url='/courses/'+encodeURIComponent(courseId)+'/training-assessments?includeManaged=true&view=summary&'+catalog.params
    void apiClient.get<{list:any[];total:number}>(url).then(response=>{
      if(response.code!==0)throw Error(response.message||'读取失败')
      if(active){setter({rows:response.data.list,loading:false,error:null});setCollectionTotal(response.data.total??response.data.list.length)}
    }).catch(error=>{if(active)setter({rows:[],loading:false,error:errorMessage(error)})})
    return()=>{active=false}
  },[owned,courseId,section,catalog.params,revision])
  const retry = () => setRevision(value => value + 1)

  return <div className="training-detail training-trainer-course">
    {(courseLoading && !course) || (course && course.id !== courseId) ? <p role="status" className="training-status">正在读取课程…</p>
      : courseError || !course ? <div role="alert" className="training-message">无法读取课程：{courseError || '请确认课程状态'}<button type="button" onClick={retry}>重试</button></div>
        : !owned ? <div role="alert" className="training-message">当前账号不是这门课程的创建者，无法在培训版管理此课程。<Link to="/dashboard">课程</Link></div>
          : <>
            <header className="training-detail-header training-course-hero">
              <div className="training-course-hero-main"><h1>{course.title}</h1>
                <div className="training-course-meta">
                  <span>{course.studentCount ?? 0} 名学员</span>
                  <span>课程状态：{course.status === 'PUBLISHED' ? '已发布' : course.status === 'DRAFT' ? '草稿' : '已完结'}</span>
                </div>
              </div>
              <TrainingCourseCode key={course.id+course.courseCode} code={course.courseCode} title={course.title}/>
            </header>
            <div className="training-course-layout training-course-layout--full"><div className="training-course-work">
            <header className="training-course-toolbar">
              <TrainingCourseTabs courseId={course.id} section={section} onSelect={setSection} />
              {['assignments','checkins','assessments'].includes(section) && !query.get(section === 'assignments' ? 'assignmentId' : section === 'checkins' ? 'checkinId' : '') && <CatalogFilters key={section+catalog.stateKey} selection={catalog.selection} onApply={catalog.apply} deadline={section!=='assessments'} label={section==='assignments'?'练习':section==='checkins'?'打卡':'测评'}/>}
            </header>
            {section === 'assignments' && <Suspense fallback={<p role="status">正在读取练习管理…</p>}><CourseAssignmentWorkspace embeddedCourse={course}/></Suspense>}

            {section === 'checkins' && <Suspense fallback={<p role="status">正在读取打卡管理…</p>}><CourseCheckinWorkspace embeddedCourse={course}/></Suspense>}

            {section === 'assessments' && <TrainingCourseAssessments key={course.id} course={course} actorId={user?.id||''}
              rows={assessments.rows} loading={assessments.loading} error={assessments.error} onRetry={retry} filtered={filtered}/>}
            {section === 'assessments' && <CatalogPagination selection={catalog.selection} onApply={catalog.apply} total={collectionTotal} loading={assessments.loading} label="测评"/>}
            {COURSE_ANALYSIS_ENABLED && section === 'analysis' && <Suspense fallback={<p role="status">正在读取统计页面…</p>}><TrainingCourseAnalysis key={course.id} courseId={course.id} actorId={user?.id} /></Suspense>}

            {section === 'management' && <TrainingCourseSettings key={course.id} course={course} onUpdated={retry} />}
            </div></div>
          </>}
  </div>
}
