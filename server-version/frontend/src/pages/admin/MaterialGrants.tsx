import React, { useEffect, useState } from 'react'
import { materialGrantApi, type MaterialGrantRow, type MaterialResourceType } from '../../api/materialGrants'

const typeLabel: Record<MaterialResourceType, string> = {
  SCALE: '量表',
  COGNITIVE_CONFIG: '认知任务类型',
}

const MaterialGrants: React.FC = () => {
  const [list, setList] = useState<MaterialGrantRow[]>([])
  const [resourceType, setResourceType] = useState<'' | MaterialResourceType>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await materialGrantApi.list(resourceType ? { resourceType } : {})
        if (response.code !== 0) throw new Error(response.message || '获取授权列表失败')
        setList(response.data?.list || [])
      } catch (err) {
        setError((err as { message?: string }).message || '获取授权列表失败')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [resourceType])

  const revoke = async (grant: MaterialGrantRow) => {
    if (!confirm(`撤销「${grant.teacher?.nickname || grant.teacher?.username || grant.teacherId}」的授权？`)) return
    try {
      setError(null)
      const response = await materialGrantApi.remove(grant.id)
      if (response.code !== 0) throw new Error(response.message || '撤销失败')
      setList((current) => current.filter((row) => row.id !== grant.id))
    } catch (err) {
      setError((err as { message?: string }).message || '撤销失败')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">材料授权</h1>
      <p className="text-sm text-gray-500 mb-4">总览已有授权。量表授权请在量表列表操作，认知任务类型授权请在新建认知任务的类型下拉旁操作。</p>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <label className="text-sm text-gray-600 mb-4 block">
        类型
        <select
          className="ml-2 border rounded px-3 py-2"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value as '' | MaterialResourceType)}
        >
          <option value="">全部</option>
          <option value="SCALE">量表</option>
          <option value="COGNITIVE_CONFIG">认知任务类型</option>
        </select>
      </label>
      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : list.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">还没有授权记录</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
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
              {list.map((grant) => (
                <tr key={grant.id}>
                  <td className="px-4 py-3 text-sm">
                    {grant.resourceMissing ? '材料已删除' : (grant.resource?.name || grant.resourceId)}
                  </td>
                  <td className="px-4 py-3 text-sm">{typeLabel[grant.resourceType]}</td>
                  <td className="px-4 py-3 text-sm">{grant.teacher?.nickname || grant.teacher?.username || grant.teacherId}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => void revoke(grant)} className="text-red-500 text-sm">撤销</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default MaterialGrants
