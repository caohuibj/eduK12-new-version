import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { parentsApi } from '../../api/parents'
import { useAuth } from '../../contexts/AuthContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import ParentFeature from './ParentFeature'
import ParentReportView from './ParentReportView'
import { useParentResource } from './useParentResource'
function Content({
  childId,
  artifactId,
}: {
  childId: string
  artifactId: string
}) {
  const load = useCallback(
    (signal: AbortSignal) => parentsApi.report(childId, artifactId, signal),
    [childId, artifactId],
  )
  const { data, error, loading, reload } = useParentResource(
    `report:${childId}:${artifactId}`,
    load,
  )
  if (loading)
    return (
      <ProductStatus kind="pending" title="正在加载报告">
        请稍候。
      </ProductStatus>
    )
  if (error || !data)
    return (
      <ProductStatus
        kind="error"
        title="报告暂时不可查看"
        actions={<ProductButton onClick={reload}>重新加载</ProductButton>}
      >
        {error || '关联或报告授权可能已失效，请返回列表核对。'}
      </ProductStatus>
    )
  return <ParentReportView report={data} />
}
export default function ParentChildReportPage() {
  const { childId = '', artifactId = '' } = useParams(),
    { user } = useAuth()
  return (
    <ProductPage width="reading">
      <PageHeader
        title="孩子报告"
        actions={
          <Link to={`/parent/children/${encodeURIComponent(childId)}`}>
            返回报告列表
          </Link>
        }
      />
      <ParentFeature>
        <Content
          key={`${user?.id}:${childId}:${artifactId}`}
          childId={childId}
          artifactId={artifactId}
        />
      </ParentFeature>
    </ProductPage>
  )
}
