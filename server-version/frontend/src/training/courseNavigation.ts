import { internalReturnTo } from '../components/app-shell/access'

// Single task reports are open; the existing multi-wave analysis remains closed.
export const COURSE_ANALYSIS_ENABLED = false
export const COURSE_GROUP_REPORT_ENABLED = true
export const COURSE_SECTIONS = [
  ['assignments', '学习'], ['checkins', '打卡'], ['assessments', '测评'],
  ['analysis', '群体报告'], ['management', '课程管理'],
] as const
export type CourseSection = typeof COURSE_SECTIONS[number][0]
const validId = (id: string | null | undefined) => id && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null
export const resolveCourseSection = (section: string | null): CourseSection => {
  if (section === 'analysis' && !COURSE_ANALYSIS_ENABLED && !COURSE_GROUP_REPORT_ENABLED) return 'assessments'
  return COURSE_SECTIONS.some(([value]) => value === section) ? section as CourseSection : 'assignments'
}

/** Navigation hints only. Editors and APIs still enforce record/course ownership. */
export function trainingCourseContext(pathname: string, search: string) {
  const params = new URLSearchParams(search)
  const direct = pathname.match(/^\/courses\/([^/]+)\/(detail|students)$/)
  if (direct) {
    const courseId = validId(direct[1])
    return courseId ? { courseId, section: direct[2] === 'students' ? 'management' as const : resolveCourseSection(params.get('section')), returnTo: pathname + search } : null
  }
  if (!/^\/(?:assignments|checkins|scales|questionnaires|questionnaire-products|general-questionnaires|composite-assessments|bundle-products|cognitive-assignments)(?:\/|$)/.test(pathname)) return null
  const safeReturn = internalReturnTo(params.get('returnTo'))
  const parent = safeReturn ? new URL(safeReturn, 'https://training.invalid') : null
  const parentId = validId(parent?.pathname.match(/^\/courses\/([^/]+)\/detail$/)?.[1])
  const hint = params.get('courseId')
  const courseId = hint === null ? parentId : validId(hint)
  if (!courseId || (parentId && courseId !== parentId)) return null
  const section = pathname.startsWith('/assignments') ? 'assignments' : pathname.startsWith('/checkins') ? 'checkins' : 'assessments'
  return { courseId, section: section as CourseSection, returnTo: parentId ? safeReturn : null }
}

