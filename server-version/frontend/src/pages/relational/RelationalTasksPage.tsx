import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ProductPage, ProductStatus } from '../../components/product-ui'
import ParentObserverPage from '../parent/ParentObserverPage'
import StudentRelationalPage from '../student/StudentRelationalPage'
import TeacherRelationalPage from '../teacher/TeacherRelationalPage'

export default function RelationalTasksPage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <ProductPage width="reading"><ProductStatus kind="info" title="加载中">正在确认关系测评身份。</ProductStatus></ProductPage>
  }
  if (!user) return <Navigate to="/" replace />
  if (user.role === 'PARENT') return <ParentObserverPage />
  if (user.role === 'STUDENT') return <StudentRelationalPage />
  if (user.role === 'TEACHER') return <TeacherRelationalPage />
  return <Navigate to="/dashboard" replace />
}
