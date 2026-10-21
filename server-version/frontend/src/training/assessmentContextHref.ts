import { trainingCourseContext } from './courseNavigation'

/** Carry navigation context only; record access and delivery remain server controlled. */
export function assessmentContextHref(path: string, pathname: string, search: string) {
  const context = trainingCourseContext(pathname, search)
  const url = new URL(path, 'https://training.invalid')
  url.searchParams.set('returnTo', context?.returnTo || pathname + search)
  if (context) url.searchParams.set('courseId', context.courseId)
  return url.pathname + url.search + url.hash
}
