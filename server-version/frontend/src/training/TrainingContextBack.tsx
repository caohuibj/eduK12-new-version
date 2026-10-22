import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { internalReturnTo } from '../components/app-shell/access'
import { routeTitle } from '../components/app-shell/navigation'
import type { Role } from '../components/app-shell/access'
import TrainingCourseTabs from './TrainingCourseTabs'
import { trainingCourseContext } from './courseNavigation'

/** Breadcrumb escape for deep legacy editors and participant submissions.
 * Context comes from a non-secret courseId URL hint; the backend remains
 * authoritative about actual course membership and task permissions. */
export default function TrainingContextBack({ role }: { role: Role | undefined }) {
  const location = useLocation()
  if (role !== 'STUDENT' && role !== 'TEACHER') return null
  const path = location.pathname
  const courseContext = role === 'TEACHER' ? trainingCourseContext(path, location.search) : null
  if (courseContext && !/^\/courses\/[^/]+\/detail$/.test(path)) {
    const pageTitle = path === '/assignments' ? '练习管理' : path === '/checkins' ? '打卡管理' : path === '/questionnaires' ? '复用测评' : routeTitle(path)
    const parent = /^\/courses\/[^/]+\/students$/.test(path)
      ? '/courses/' + encodeURIComponent(courseContext.courseId) + '/detail?section=management'
      : courseContext.returnTo || '/courses/' + encodeURIComponent(courseContext.courseId) + '/detail' + (courseContext.section === 'assessments' ? '?section=assessments' : '')
    return <section className="training-course-context" aria-label="当前课程工作区">
      <nav className="training-context-trail" aria-label="当前位置"><Link to="/dashboard">课程</Link><span>/</span><Link to={parent}>返回当前课程</Link><span>/</span><span aria-current="page">{pageTitle}</span></nav>
      <TrainingCourseTabs {...courseContext} />
    </section>
  }
  const studentRoot = role === 'STUDENT'
  if (studentRoot && /^\/student\/(?:assignments|checkins|scales|questionnaires|cognitive|composite|situational)\//.test(path)) return null
  const search=new URLSearchParams(location.search)
  const returnTo=internalReturnTo(search.get('returnTo'))
  const hintedCourse=search.get('courseId')
  const safeCourse=hintedCourse&&/^[A-Za-z0-9_-]{1,100}$/.test(hintedCourse)?hintedCourse:null
  if(returnTo||safeCourse&&/^\/(questionnaire-products|composite-assessments|scales|cognitive-assignments)\//.test(path)) {
    const home=studentRoot?'/student':'/dashboard'
    const parent=returnTo||(studentRoot?'/student/courses/':'/courses/')+encodeURIComponent(safeCourse!)+(studentRoot?'':'/detail?section=assessments')
    return <nav className="training-context-trail" aria-label="当前位置"><Link to={home}>{studentRoot?'我的课程':'课程'}</Link><span>/</span><Link to={parent}>{safeCourse?'返回当前课程':'返回上一层'}</Link><span>/</span><span aria-current="page">{routeTitle(path)}</span></nav>
  }

  if (role==='TEACHER' && /^\/(media-library|toolkit)(\/|$)/.test(path)) return null
  if (role==='TEACHER' && path==='/scales') return <Link className="training-context-back" to="/toolkit"><ArrowLeft size={16} aria-hidden="true"/>返回工具</Link>
  if (path === '/student' || path === '/dashboard') return null
  // The two purpose-built Training Course pages have their own back link.
  if (studentRoot && /^\/student\/courses\/[^/]+$/.test(path)) return null
  if (!studentRoot && /^\/courses\/[^/]+\/detail$/.test(path)) return null
  // The scale editor already has a return-to-list action.
  if (!studentRoot && /^\/scales\/[^/]+$/.test(path)) return null
  // The cognitive task editor provides its own return-to-list action.
  if (!studentRoot && /^\/cognitive-assignments\/[^/]+$/.test(path)) return null
  // Composition editors already provide a return-to-list link.
  if (!studentRoot && /^\/questionnaire-products\/[^/]+$/.test(path)) return null
  // The authorized roster page already has an explicit return-to-course action.
  if (!studentRoot && /^\/courses\/[^/]+\/students$/.test(path)) return null
  // Learner task entry and history have their own return action.
  if (studentRoot && /^\/student\/cognitive\/(?:history|assignments\/[^/]+)$/.test(path)) return null
  const params = new URLSearchParams(location.search)
  const hintedId = params.get('courseId')
  const courseId = hintedId && /^[A-Za-z0-9_-]{1,100}$/.test(hintedId) ? hintedId : null
  const home = studentRoot ? '/student' : '/dashboard'
  const to = courseId
    ? studentRoot ? '/student/courses/' + encodeURIComponent(courseId)
      : '/courses/' + encodeURIComponent(courseId) + '/detail'
    : home

  return <Link className="training-context-back" to={to}>
    <ArrowLeft size={16} aria-hidden="true" />{courseId ? '返回当前课程' : studentRoot ? '返回我的课程' : '返回课程'}
  </Link>
}
