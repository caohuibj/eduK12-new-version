import { Link } from 'react-router-dom'
import { COURSE_ANALYSIS_ENABLED, COURSE_GROUP_REPORT_ENABLED, COURSE_SECTIONS, type CourseSection } from './courseNavigation'
import './training-course-tabs.css'

export default function TrainingCourseTabs({ courseId, section, returnTo, onSelect, onNavigate }: {
  courseId: string
  section: CourseSection
  returnTo?: string | null
  onSelect?: (section: CourseSection) => void
  onNavigate?: (href: string) => void
}) {
  const base = '/courses/' + encodeURIComponent(courseId) + '/detail'
  const parent = returnTo ? new URL(returnTo, 'https://training.invalid') : null
  const href = (value: CourseSection) => {
    const params = new URLSearchParams(parent?.pathname === base ? parent.search : '')
    params.set('section', value)
    return base + '?' + params.toString()
  }
  return <nav className="training-section-switch training-course-tabs" aria-label="课程管理内容">
    {COURSE_SECTIONS.filter(([value]) => COURSE_ANALYSIS_ENABLED || COURSE_GROUP_REPORT_ENABLED || value !== 'analysis').map(([value, label]) => onSelect
      ? <button key={value} type="button" className="training-section-tab" aria-pressed={section === value} onClick={() => onSelect(value)}>{label}</button>
      : <Link key={value} className="training-section-tab" to={href(value)} aria-current={section === value ? 'page' : undefined}
          onClick={event => { if (onNavigate) { event.preventDefault(); onNavigate(href(value)) } }}>{label}</Link>)}
  </nav>
}
