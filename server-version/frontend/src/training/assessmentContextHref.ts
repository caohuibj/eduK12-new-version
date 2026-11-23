import { internalReturnTo } from '../components/app-shell/access'
import { trainingCourseContext } from './courseNavigation'

/** Carry navigation context only; record access and delivery remain server controlled. */
export function assessmentContextHref(path: string, pathname: string, search: string) {
  const context = trainingCourseContext(pathname, search)
  const url = new URL(path, 'https://training.invalid')
  // Returning to the index pops the existing parent instead of making the
  // editor its parent again. Otherwise list/editor trips grow returnTo forever.
  if (!context && url.pathname === '/questionnaires') {
    const parent = internalReturnTo(new URLSearchParams(search).get('returnTo'))
    const previous = parent ? new URL(parent, 'https://training.invalid') : null
    if (previous?.pathname === url.pathname) return previous.pathname + previous.search + previous.hash
    return url.pathname + url.search + url.hash
  }
  url.searchParams.set('returnTo', context?.returnTo || pathname + search)
  if (context) url.searchParams.set('courseId', context.courseId)
  return url.pathname + url.search + url.hash
}
