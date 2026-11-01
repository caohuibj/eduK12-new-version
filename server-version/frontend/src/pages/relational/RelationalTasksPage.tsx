import { Link, Navigate } from 'react-router-dom'
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
  const childEntry = <p className="px-4 py-3"><Link to="/relational/child-control">儿童认知控制与日常观察</Link></p>
  if (user.role === 'PARENT') return <>{childEntry}<ParentObserverPage /></>
  if (user.role === 'STUDENT') return <>{childEntry}<StudentRelationalPage /></>
  if (user.role === 'TEACHER') return <>{childEntry}<TeacherRelationalPage /></>
  return <Navigate to="/dashboard" replace />
}
