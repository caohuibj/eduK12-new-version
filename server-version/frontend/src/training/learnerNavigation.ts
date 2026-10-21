import { createContext, useCallback, useContext } from 'react'
import { useLocation, useNavigate, type NavigateFunction, type NavigateOptions, type To } from 'react-router-dom'
import { internalReturnTo } from '../components/app-shell/access'

export type LearnerSection = 'assignments' | 'checkins' | 'assessments'
const idPattern = /^[A-Za-z0-9_-]{1,100}$/
const safeId = (id: string | null | undefined) => id && idPattern.test(id) ? id : null
export const learnerSection = (value: string | null): LearnerSection =>
  value === 'checkins' || value === 'assessments' ? value : 'assignments'

export function learnerCourseHref(courseId: string, section: LearnerSection) {
  return `/student/courses/${encodeURIComponent(courseId)}?section=${section}`
}

/** Presentation only. These hints never authorize a course, task, attempt or
 * report. Domain reads and the existing admission/feedback rules own access. */
export function learnerCourseContext(search: string, authoritativeCourseId?: string | null, section?: LearnerSection) {
  const query = new URLSearchParams(search)
  const requestedReturn = internalReturnTo(query.get('returnTo'))
  const returnUrl = requestedReturn ? new URL(requestedReturn, 'https://navigation.invalid') : null
  const returnCourseId = returnUrl?.pathname.match(/^\/student\/courses\/([A-Za-z0-9_-]{1,100})$/)?.[1]
  const courseId = safeId(authoritativeCourseId) || safeId(query.get('courseId')) || returnCourseId
  return courseId ? { courseId, section: section || learnerSection(query.get('courseSection') || returnUrl?.searchParams.get('section') || 'assessments') } : null
}

export function isLearnerDiscoveryPath(path: string) {
  return /^\/student\/(?:cognitive(?:\/history)?|situational(?:\/history)?|scales|questionnaires|assignments|checkins)\/?$/.test(path)
    || /^\/scale-library(?:\/|$)/.test(path)
}

export function withLearnerCourse(target: string, context: ReturnType<typeof learnerCourseContext>): string {
  const safe = internalReturnTo(target)
  if (!context || !safe) return target
  const url = new URL(safe, 'https://navigation.invalid')
  if (!/^\/student\/(?:assignments|checkins|scales|questionnaires|cognitive|composite|situational)\//.test(url.pathname)) return target
  url.searchParams.set('courseId', context.courseId)
  url.searchParams.set('courseSection', context.section)
  return url.pathname + url.search + url.hash
}

export const LearnerNavigationContext = createContext(false)

export function useTrainingLearnerNavigation(options: {
  courseId?: string | null
  section?: LearnerSection
  parentAttemptId?: string | null
} = {}) {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const trainingStudent = useContext(LearnerNavigationContext)
  const enabled = trainingStudent && location.pathname.startsWith('/student/')
  const inferredSection = location.pathname.startsWith('/student/assignments/') ? 'assignments'
    : location.pathname.startsWith('/student/checkins/') ? 'checkins' : 'assessments'
  const context = learnerCourseContext(location.search, options.courseId, options.section || inferredSection)
  const courseId = context?.courseId
  const section = context?.section
  const authoritativeId = safeId(options.courseId)
  const parentId = safeId(options.parentAttemptId)
  const courseHref = context ? learnerCourseHref(context.courseId, context.section) : '/student'
  const parentHref = parentId ? withLearnerCourse(`/student/composite/attempts/${parentId}`, context) : null
  const backHref = parentHref || courseHref
  const backLabel = parentHref ? '继续整份测评' : context ? '返回当前课程' : '返回我的课程'
  const withContext = useCallback((target: string) => {
    if (!enabled) return target
    const current = courseId && section ? { courseId, section } : null
    const safe = internalReturnTo(target)
    const explicit = safe ? learnerCourseContext(new URL(safe, 'https://navigation.invalid').search) : null
    return withLearnerCourse(target, authoritativeId ? current : explicit || current)
  }, [enabled, courseId, section, authoritativeId])
  const navigate = useCallback(((to: To | number, navigateOptions?: NavigateOptions) => {
    if (!enabled) {
      if (typeof to === 'number') return routerNavigate(to)
      return routerNavigate(to, navigateOptions)
    }
    if (typeof to === 'number') return to === -1 ? routerNavigate(backHref, navigateOptions) : routerNavigate(to)
    const pathname = typeof to === 'string' ? to.split(/[?#]/)[0] : to.pathname || location.pathname
    if (isLearnerDiscoveryPath(pathname) || pathname === '/student' || pathname === '/my-assessments') {
      return routerNavigate(backHref, navigateOptions)
    }
    return routerNavigate(typeof to === 'string' ? withContext(to)
      : { ...to, search: new URL(withContext(pathname + (to.search || '')), 'https://navigation.invalid').search }, navigateOptions)
  }) as NavigateFunction, [enabled, routerNavigate, backHref, withContext, location.pathname])
  return { enabled, navigate: enabled ? navigate : routerNavigate, withContext, backHref, backLabel, courseHref }
}
