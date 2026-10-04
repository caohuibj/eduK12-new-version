import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
function Content({ childId }: { childId: string }) {
  const [page, setPage] = useState(1),
    load = useCallback(
      async (signal: AbortSignal) => {
        const [overview, reports] = await Promise.all([
          parentsApi.overview(childId, signal),
          parentsApi.reports(childId, page, signal),
        ])
        return { overview, reports }
      },
      [childId, page],
    )
  const { data, error, loading, reload } = useParentResource(
    `child:${childId}:${page}`,
    load,
  )
  if (loading)
    return (
      <ProductStatus kind="pending" title="正在加载孩子信息">
        请稍候。
      </ProductStatus>
    )
  if (error || !data)
    return (
      <ProductStatus
        kind="error"
        title="孩子信息不可用"
        actions={
          <>
            <ProductButton onClick={reload}>重试</ProductButton>
            <Link to="/parent/children">返回孩子列表</Link>
          </>
        }
      >
        {error}
      </ProductStatus>
    )
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">
        {data.overview.child.displayName}
      </h2>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">课程概况</h3>
        {data.overview.courses.length ? (
          <ul className="mt-3 space-y-2">
            {data.overview.courses.map((course) => (
              <li key={course.id}>{course.title}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">暂无可展示的课程。</p>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">孩子报告</h3>
        {data.reports.list.length ? (
          data.reports.list.map((report) => (
            <DiscoveryCard
              key={report.id}
              to={`/parent/children/${encodeURIComponent(childId)}/reports/${encodeURIComponent(report.id)}`}
              title={report.title}
              description={
                report.mode === 'COMPLETION_ONLY'
                  ? '测评完成情况'
                  : '家长教育摘要'
              }
            />
          ))
        ) : (
          <ProductStatus kind="info" title="暂无获准查看的报告">
            这里仅展示已同意并获准披露的报告。暂无报告不代表孩子未完成测评。
          </ProductStatus>
        )}
        <div className="flex gap-3">
          <ProductButton
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </ProductButton>
          <span>第 {page} 页</span>
          <ProductButton
            disabled={!data.reports.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </ProductButton>
        </div>
      </section>
    </div>
  )
}
export default function ParentChildPage() {
  const { childId = '' } = useParams(),
    { user } = useAuth()
  return (
    <ProductPage width="reading">
      <PageHeader
        title="孩子概况与报告"
        actions={<Link to="/parent/children">切换孩子</Link>}
      />
      <ParentFeature>
        <Content key={`${user?.id}:${childId}`} childId={childId} />
      </ParentFeature>
    </ProductPage>
  )
}
