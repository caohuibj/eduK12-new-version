import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ProductPage, ProductStatus } from '../components/product-ui'
import { isTrainingHost } from './context'
import { useAuth } from '../contexts/AuthContext'

export default function TrainingSjtAuthoringAccess({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!isTrainingHost() || user?.role === 'ADMIN' || user?.platformRole === 'SYSTEM_ADMIN') return <>{children}</>
  return <ProductPage><ProductStatus kind="info" title="暂不开放情境判断编制" actions={<Link to="/toolkit">返回工具</Link>}>
    当前可创建和编辑表单、量表，并创建和编辑普通组合问卷。已授权的情境判断测验可在组合问卷中选用。
  </ProductStatus></ProductPage>
}
