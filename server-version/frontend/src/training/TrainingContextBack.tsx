import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { Role } from '../components/app-shell/access'

/** Breadcrumb escape for deep legacy editors and participant submissions.
 * Context comes from a non-secret courseId URL hint; the backend remains
 * authoritative about actual course membership and task permissions. */
export default function TrainingContextBack({ role }: { role: Role | undefined }) {
  const location = useLocation()
  if (role !== 'STUDENT' && role !== 'TEACHER') return null
  const path = location.pathname
  const studentRoot = role === 'STUDENT'
  if (path === '/student' || path === '/dashboard') return null
  // The two purpose-built Training Course pages have their own back link.
  if (studentRoot && /^\/student\/courses\/[^/]+$/.test(path)) return null
  if (!studentRoot && /^\/courses\/[^/]+\/detail$/.test(path)) return null
  // The authorized roster page already has an explicit return-to-course action.
  if (!studentRoot && /^\/courses\/[^/]+\/students$/.test(path)) return null
  const params = new URLSearchParams(location.search)
  const hintedId = params.get('courseId')
  const courseId = hintedId && /^[A-Za-z0-9_-]{1,100}$/.test(hintedId) ? hintedId : null
  const home = studentRoot ? '/student' : '/dashboard'
  const to = courseId
    ? studentRoot ? '/student/courses/' + encodeURIComponent(courseId)
      : '/courses/' + encodeURIComponent(courseId) + '/detail'
    : home

  return <Link className="training-context-back" to={to}>
    <ArrowLeft size={16} aria-hidden="true" />{courseId ? '返回当前课程' : '返回我的课程'}
  </Link>
}
