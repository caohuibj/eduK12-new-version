import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCapabilities } from '../../contexts/CapabilitiesContext'
import { ProductButton, ProductStatus } from '../../components/product-ui'
export default function ParentFeature({ children }: { children: ReactNode }) {
  const { parentPortalEnabled, isLoading, status, retry } = useCapabilities()
  if (status === 'error')
    return (
      <ProductStatus
        kind="error"
        title="家长功能状态读取失败"
        actions={<ProductButton onClick={retry}>重试</ProductButton>}
      >
        暂时无法确认入口状态，请重试。
      </ProductStatus>
    )
  if (isLoading)
    return (
      <ProductStatus kind="pending" title="正在确认家长功能">
        请稍候。
      </ProductStatus>
    )
  if (!parentPortalEnabled)
    return (
      <ProductStatus
        kind="info"
        title="家长入口尚未开放"
        actions={<Link to="/">返回首页</Link>}
      >
        请以学校通知为准。
      </ProductStatus>
    )
  return <>{children}</>
}
