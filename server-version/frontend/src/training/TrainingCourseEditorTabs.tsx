import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isTrainingHost } from './context'
import TrainingCourseTabs from './TrainingCourseTabs'
import { trainingCourseContext } from './courseNavigation'

/** The native editor dialog makes the page behind it inert, so it owns the same
 * course navigation while open. Reuse the editor's save/discard guard. */
export default function TrainingCourseEditorTabs({ courseId, leave }: {
  courseId: string
  leave: (action: () => void) => void
}) {
  const location = useLocation(), navigate = useNavigate()
  const { user } = useAuth()
  const context = trainingCourseContext(location.pathname, location.search)
  if (!isTrainingHost() || user?.role !== 'TEACHER' || !context || context.courseId !== courseId) return null
  return <div className="training-editor-course-tabs"><TrainingCourseTabs {...context} onNavigate={href => leave(() => navigate(href))} /></div>
}
