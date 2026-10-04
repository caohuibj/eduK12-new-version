import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { parentsApi } from '../../api/parents'
import { useAuth } from '../../contexts/AuthContext'
import {
  DiscoveryCard,
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import ParentFeature from './ParentFeature'
import { useParentResource } from './useParentResource'
function Content() {
  const [page, setPage] = useState(1),
    load = useCallback(
      (signal: AbortSignal) => parentsApi.children(page, signal),
      [page],
    )
  const { data, error, loading, reload } = useParentResource(
    `children:${page}`,
    load,
  )
  return (
    <div className="space-y-4">
      {loading ? (
        <ProductStatus kind="pending" title="正在加载孩子列表">
          请稍候。
        </ProductStatus>
      ) : error ? (
        <ProductStatus
          kind="error"
          title="孩子列表加载失败"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      ) : (
        <>
          {!data?.list.length && (
            <ProductStatus
              kind="info"
              title="暂无已确认的孩子"
              actions={<Link to="/parent/links">关联孩子</Link>}
            >
              提交关联申请后，需要学生确认。
            </ProductStatus>
          )}
          {data?.list.map((child) => (
            <DiscoveryCard
              key={child.relationshipId}
              to={`/parent/children/${encodeURIComponent(child.childId)}`}
              title={child.displayName}
              description="查看课程概况与获准报告"
            />
          ))}
          <div className="flex gap-3">
            <ProductButton
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </ProductButton>
            <span>第 {page} 页</span>
            <ProductButton
              disabled={!data?.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </ProductButton>
          </div>
        </>
      )}
    </div>
  )
}
export default function ParentChildrenPage() {
  const { user } = useAuth()
  return (
    <ProductPage width="reading">
      <PageHeader
        title="我的孩子"
        description="查看已确认关联的孩子。"
        actions={<Link to="/parent/links">关联孩子</Link>}
      />
      <ParentFeature>
        <Content key={user?.id} />
      </ParentFeature>
    </ProductPage>
  )
}
