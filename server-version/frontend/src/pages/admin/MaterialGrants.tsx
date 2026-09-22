import React, { useEffect, useState } from 'react'
import { materialGrantApi, type MaterialGrantRow, type MaterialResourceType } from '../../api/materialGrants'
import { PageHeader } from '../../components/product-ui/PageHeader'
import { ProductPage } from '../../components/product-ui/ProductPage'

const typeLabel: Record<MaterialResourceType, string> = {
  ASSESSMENT_BUNDLE: 'Bundle 综合测评包',
  SCALE: '量表',
  COGNITIVE_CONFIG: '认知任务类型',
  REPORT_PACKAGE: '报告包',
}

const MaterialGrants: React.FC = () => {
  const [list, setList] = useState<MaterialGrantRow[]>([])
  const [resourceType, setResourceType] = useState<'' | MaterialResourceType>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await materialGrantApi.list(resourceType ? { resourceType } : {})
      if (response.code !== 0) throw new Error(response.message || '获取授权列表失败')
      setList(response.data?.list || [])
    } catch (loadError) {
      setError((loadError as { message?: string }).message || '获取授权列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [resourceType])

  const revoke = async (grant: MaterialGrantRow) => {
    if (!confirm(`撤销「${grant.teacher?.nickname || grant.teacher?.username || grant.teacherId}」的授权？`)) return
    try {
      setError(null)
      const response = await materialGrantApi.remove(grant.id)
      if (response.code !== 0) throw new Error(response.message || '撤销失败')
      setList(current => current.filter(row => row.id !== grant.id))
    } catch (operationError) {
      setError((operationError as { message?: string }).message || '撤销失败')
    }
  }

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader
        title="材料授权"
        description="总览已有授权。量表和认知任务授权在对应材料页面操作；报告包授权只对代码内已发布版本开放。"
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={() => void load()}>重试</button>
          </div>
        </div>
      )}

      <label className="block max-w-sm text-sm text-gray-700">
        <span className="mb-1 block font-medium">材料类型</span>
        <select
          className="input w-full"
          value={resourceType}
          onChange={event => setResourceType(event.target.value as '' | MaterialResourceType)}
        >
          <option value="">全部</option>
          <option value="SCALE">量表</option>
          <option value="COGNITIVE_CONFIG">认知任务类型</option>
          <option value="REPORT_PACKAGE">报告包</option>
          <option value="ASSESSMENT_BUNDLE">Bundle 综合测评包</option>
        </select>
      </label>

      {loading ? (
        <p role="status" aria-live="polite" className="text-gray-500">加载中...</p>
      ) : list.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">还没有授权记录</div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">材料</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">教师</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.map(grant => {
                  const teacherName = grant.teacher?.nickname || grant.teacher?.username || grant.teacherId
                  const resourceName = grant.resourceMissing ? '材料已删除' : (grant.resource?.name || grant.resourceId)
                  return (
                    <tr key={grant.id}>
                      <td className="px-4 py-3 text-sm">{resourceName}</td>
                      <td className="px-4 py-3 text-sm">{typeLabel[grant.resourceType]}</td>
                      <td className="px-4 py-3 text-sm">{teacherName}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void revoke(grant)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          撤销
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ProductPage>
  )
}

export default MaterialGrants