import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '../components/app-shell/access'
import { isTrainingHost } from './context'
import { isLearnerDiscoveryPath, learnerCourseContext, learnerCourseHref, LearnerNavigationContext } from './learnerNavigation'

/** Training navigation only. Shared organization inboxes, authorized task
 * deep links and historical report details retain their original access rules. */
export function TrainingLearnerNavigationBoundary({ role, children }: { role?: Role; children: ReactNode }) {
  const location = useLocation()
  const enabled = isTrainingHost() && role === 'STUDENT'
  const context = learnerCourseContext(location.search)
  const target = context ? learnerCourseHref(context.courseId, context.section) : '/student'
  return <LearnerNavigationContext.Provider value={enabled}>
    {enabled && isLearnerDiscoveryPath(location.pathname) ? <Navigate to={target} replace /> : children}
  </LearnerNavigationContext.Provider>
}
