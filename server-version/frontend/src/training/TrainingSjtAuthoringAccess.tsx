import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ProductPage, ProductStatus } from '../components/product-ui'
import { isTrainingHost } from './context'

export default function TrainingSjtAuthoringAccess({ children }: { children: ReactNode }) {
  if (!isTrainingHost()) return <>{children}</>
  return <ProductPage><ProductStatus kind="info" title="暂不开放情境判断编制" actions={<Link to="/toolkit">返回工具</Link>}>
    当前可创建和编辑表单、量表，并编辑已有组合问卷。已授权的情境判断测验可在组合问卷中选用。
  </ProductStatus></ProductPage>
}
