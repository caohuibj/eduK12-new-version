import { useCallback, useEffect, useState } from 'react'
import { relationalApi, type ParentChild, type RelationalProduct, type RelationalTask } from '../../api/relational'
import RelationalTaskList from '../../components/relational/RelationalTaskList'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import ObserverSelfServe from './ObserverSelfServe'

export default function ParentObserverPage() {
  const [catalog, setCatalog] = useState<RelationalProduct[]>([])
  const [children, setChildren] = useState<ParentChild[]>([])
  const [tasks, setTasks] = useState<RelationalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshTasks = useCallback(async () => {
    setTasks(await relationalApi.tasks())
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [nextCatalog, nextChildren, nextTasks] = await Promise.all([
        relationalApi.catalog(),
        relationalApi.parentChildren(),
        relationalApi.tasks(),
      ])
      setCatalog(nextCatalog)
      setChildren(nextChildren)
      setTasks(nextTasks)
    } catch (err) {
      setError((err as { message?: string }).message || '关系测评数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return <ProductPage width="reading">
    <PageHeader title="观察测评" description="家长作为独立 respondent 完成观察任务。不会把孩子自评、其他家长或教师答案合并成一个个人分数。" />
    {loading ? <ProductStatus kind="info" title="加载中">正在读取关系、任务和已发布内容。</ProductStatus> : error ? (
      <ProductStatus kind="error" title="无法加载">{error}</ProductStatus>
    ) : (
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">我的任务</h2>
          <RelationalTaskList tasks={tasks} onRefresh={refreshTasks} />
        </section>
        <ObserverSelfServe
          catalog={catalog}
          childrenBound={children}
          disabled={busy}
          onStart={({ product, studentUserId }) => {
            void (async () => {
              try {
                setBusy(true)
                setError(null)
                await relationalApi.issueParentSelfServe({ product, studentUserId })
                await refreshTasks()
              } catch (err) {
                setError((err as { message?: string }).message || '无法发起观察测评')
              } finally {
                setBusy(false)
              }
            })()
          }}
        />
      </div>
    )}
  </ProductPage>
}
