import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { sessionFetch } from '../api/client'
import { Plus, Edit, Trash2, Eye, EyeOff, FileText, Users, ClipboardList, Download, X, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import TagBadge from '../components/TagBadge'
import TagFilter from '../components/TagFilter'
import MaterialGrantModal from '../components/MaterialGrantModal'

interface Scale {
  id: string
  code: string
  name: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' | 'ARCHIVED'
  instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
  instrumentVersion?: string
  estimatedTime: number | null
  instruction: string | null
  tags?: string[]
  definition?: {
    schemaVersion?: number
    items?: unknown[]
    scoring?: { scores?: Array<{ type?: string }> }
  } | null
  source?: 'owned' | 'granted' | 'other'
  createdAt: string
  updatedAt: string
  creator: {
    id: string
    username: string
    nickname: string | null
  }
  courseScales?: Array<{
    course: {
      id: string
      title: string
    }
  }>
  _count: {
    assessments?: number
  }
}

const v2ItemCount = (scale: Scale): number => (
  scale.definition?.schemaVersion === 2 && Array.isArray(scale.definition.items)
    ? scale.definition.items.length
    : 0
)

const v2DimensionCount = (scale: Scale): number => (
  scale.definition?.schemaVersion === 2 && Array.isArray(scale.definition.scoring?.scores)
    ? scale.definition.scoring.scores.filter((score) => score.type === 'dimension').length
    : 0
)

const ScaleList: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  
  const [scales, setScales] = useState<Scale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  
  // 导出相关状态
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportScaleId, setExportScaleId] = useState<string | null>(null)
  const [exportPreview, setExportPreview] = useState<any>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportOptions, setExportOptions] = useState({
    anonymize: true,
    minProgress: 100,
    dateStart: '',
    dateEnd: '',
    format: 'csv' as 'csv' | 'sav' | 'spss'
  })
  const [grantTarget, setGrantTarget] = useState<Scale | null>(null)

  useEffect(() => {
    fetchScales()
    fetchTags()
  }, [])

  const fetchScales = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<{ list: Scale[]; total: number }>('/scales?page=1&pageSize=100')
      if (response.code === 0) {
        setScales(response.data.list)
      } else {
        setError(response.message)
      }
    } catch (err: any) {
      setError(err.message || '获取量表列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchTags = async () => {
    try {
      const response = await apiClient.get('/scales/tags')
      if (response.code === 0) {
        setAvailableTags(response.data.tags)
      }
    } catch (error) {
      console.error('获取标签列表失败:', error)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除量表"${name}"吗？此操作不可恢复。`)) {
      return
    }

    try {
      const response = await apiClient.delete(`/scales/${id}`)
      if (response.code === 0) {
        setScales(scales.filter((s) => s.id !== id))
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  const handlePublish = async (id: string) => {
    try {
      const response = await apiClient.post(`/scales/${id}/publish`)
      if (response.code === 0) {
        fetchScales()
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '发布失败')
    }
  }

  const handleDeprecate = async (id: string) => {
    if (!confirm('确定要废弃此量表吗？废弃后将不再对学生可见。')) {
      return
    }

    try {
      const response = await apiClient.post(`/scales/${id}/deprecate`)
      if (response.code === 0) {
        fetchScales()
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '废弃失败')
    }
  }

  // 打开导出弹窗
  const handleOpenExport = async (scaleId: string) => {
    setExportScaleId(scaleId)
    setExportLoading(true)
    try {
      const response = await apiClient.get(`/scales/${scaleId}/export/preview`)
      if (response.code === 0) {
        setExportPreview(response.data)
        setShowExportModal(true)
      } else {
        alert(response.message || '获取预览失败')
      }
    } catch (err: any) {
      alert(err.message || '获取预览失败')
    } finally {
      setExportLoading(false)
    }
  }

  // 执行导出
  const handleExport = async () => {
    if (!exportScaleId) return
    setExportLoading(true)
    try {
      const response = await apiClient.post(`/scales/${exportScaleId}/export`, {
        anonymize: exportOptions.anonymize,
        minProgress: exportOptions.minProgress,
        dateRange: {
          start: exportOptions.dateStart || undefined,
          end: exportOptions.dateEnd || undefined
        },
        format: exportOptions.format
      })
      
      if (response.code === 0) {
        // 使用 fetch 下载文件（带认证）
        // 下载主文件
        const mainUrl = `/api/scales/exports/${response.data.fileName}`
        sessionFetch(mainUrl)
          .then(res => res.blob())
          .then(blob => {
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = response.data.fileName
            a.click()
            window.URL.revokeObjectURL(url)
          })
        
        // 如果是 spss 格式，还需要下载 SPS 文件
        if (response.data.spsPath) {
          const spsFileName = response.data.fileName.replace('.csv', '.sps')
          sessionFetch(`/api/scales/exports/${spsFileName}`)
            .then(res => res.blob())
            .then(blob => {
              const url = window.URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = spsFileName
              a.click()
              window.URL.revokeObjectURL(url)
            })
        }
        
        const formatLabel = exportOptions.format === 'sav' ? 'SAV' : 
                           exportOptions.format === 'spss' ? 'CSV+SPS' : 'CSV'
        alert(`导出成功！\n格式: ${formatLabel}\n记录数: ${response.data.recordCount}\n字段数: ${response.data.fieldCount}\n\n文件已开始下载...`)
        setShowExportModal(false)
      } else {
        alert(response.message || '导出失败')
      }
    } catch (err: any) {
      alert(err.message || '导出失败')
    } finally {
      setExportLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      PUBLISHED: 'bg-green-100 text-green-800',
      DEPRECATED: 'bg-yellow-100 text-yellow-800',
      ARCHIVED: 'bg-red-100 text-red-800',
    }
    const labels: Record<string, string> = {
      DRAFT: '草稿',
      PUBLISHED: '已发布',
      DEPRECATED: '已废弃',
      ARCHIVED: '已归档',
    }
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.DRAFT}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">心理量表管理</h1>
        <Link
          to="/scales/new"
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          创建量表
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Tag Filter */}
      {availableTags.length > 0 && (
        <TagFilter
          availableTags={availableTags}
          selectedTags={selectedTags}
          onChange={setSelectedTags}
          title="标签筛选"
        />
      )}

      {scales.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">暂无量表</p>
          <Link
            to="/scales/new"
            className="text-primary hover:text-primary/80"
          >
            创建第一个量表
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  量表信息
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  统计
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建者
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scales.filter(scale => {
                if (selectedTags.length === 0) return true
                return selectedTags.some(tag => scale.tags?.includes(tag))
              }).map((scale) => (
                <tr key={scale.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-medium text-gray-900">{scale.name}</div>
                        {scale.source === 'granted' && (
                          <span className="px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700">管理员授权 · 只读</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{scale.code}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {scale.instrumentClass === 'STANDARD' ? 'STANDARD package · 只读' : '自定义量表 · 描述性结果'}
                        {scale.instrumentVersion ? ` · v${scale.instrumentVersion}` : ''}
                      </div>
                      {scale.courseScales && scale.courseScales.length > 0 && (
                        <div className="text-xs text-blue-600 mt-1">
                          课程: {scale.courseScales.map((courseScale) => courseScale.course.title).join('、')}
                        </div>
                      )}
                      {scale.tags && scale.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {scale.tags.map((tag, index) => (
                            <TagBadge key={index} tag={tag} />
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(scale.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <ClipboardList className="w-4 h-4" />
                        {v2ItemCount(scale)} 题
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <FileText className="w-4 h-4" />
                        {v2DimensionCount(scale)} 维度
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Users className="w-4 h-4" />
                        {scale._count?.assessments ?? 0} 测评
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {scale.creator.nickname || scale.creator.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(scale.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      {scale.source === 'granted' ? (
                        <span className="text-xs text-gray-400">只读</span>
                      ) : (
                        <>
                          <Link
                            to={`/scales/${scale.id}`}
                            className="text-primary hover:text-primary/80"
                            title="编辑"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          {scale.status === 'DRAFT' && scale.instrumentClass !== 'STANDARD' && (
                            <button
                              onClick={() => handlePublish(scale.id)}
                              className="text-green-600 hover:text-green-800"
                              title="发布"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {scale.status === 'PUBLISHED' && (
                            <button
                              onClick={() => handleDeprecate(scale.id)}
                              className="text-yellow-600 hover:text-yellow-800"
                              title="废弃"
                            >
                              <EyeOff className="w-4 h-4" />
                            </button>
                          )}
                          {(scale._count?.assessments ?? 0) > 0 && (
                            <button
                              onClick={() => handleOpenExport(scale.id)}
                              className="text-blue-600 hover:text-blue-800"
                              title="导出数据"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          {(scale._count?.assessments ?? 0) === 0 && scale.status === 'DRAFT' && scale.instrumentClass !== 'STANDARD' && (
                            <button
                              onClick={() => handleDelete(scale.id, scale.name)}
                              className="text-red-600 hover:text-red-800"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && scale.status === 'PUBLISHED' && (
                            <button
                              onClick={() => setGrantTarget(scale)}
                              className="text-indigo-600 hover:text-indigo-800"
                              title="授权给教师"
                            >
                              <UserPlus className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 导出弹窗 */}
      {showExportModal && exportPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-medium">导出测评数据</h3>
              <button onClick={() => setShowExportModal(false)}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* 统计信息 */}
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-2xl font-bold text-blue-600">{exportPreview.completedCount}</div>
                  <div className="text-xs text-gray-500">已完成测评</div>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-2xl font-bold text-green-600">{exportPreview.itemCount}</div>
                  <div className="text-xs text-gray-500">题目数量</div>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <div className="text-2xl font-bold text-purple-600">{exportPreview.dimensionCount}</div>
                  <div className="text-xs text-gray-500">维度数量</div>
                </div>
                <div className="bg-orange-50 p-3 rounded">
                  <div className="text-2xl font-bold text-orange-600">{exportPreview.fields?.length || 0}</div>
                  <div className="text-xs text-gray-500">导出字段</div>
                </div>
              </div>

              {/* 导出选项 */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-gray-700">导出选项</h4>
                
                {/* 格式选择 */}
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-600">导出格式:</label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="format"
                        value="csv"
                        checked={exportOptions.format === 'csv'}
                        onChange={(e) => setExportOptions({ ...exportOptions, format: e.target.value as 'csv' })}
                        className="mr-1"
                      />
                      <span className="text-sm">CSV</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="format"
                        value="sav"
                        checked={exportOptions.format === 'sav'}
                        onChange={(e) => setExportOptions({ ...exportOptions, format: e.target.value as 'sav' })}
                        className="mr-1"
                      />
                      <span className="text-sm">SAV (SPSS)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="format"
                        value="spss"
                        checked={exportOptions.format === 'spss'}
                        onChange={(e) => setExportOptions({ ...exportOptions, format: e.target.value as 'spss' })}
                        className="mr-1"
                      />
                      <span className="text-sm">CSV + SPS</span>
                    </label>
                  </div>
                </div>
                
                {/* 脱敏选项 - 仅管理员可选 */}
                {isAdmin ? (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="anonymize"
                      checked={exportOptions.anonymize}
                      onChange={(e) => setExportOptions({ ...exportOptions, anonymize: e.target.checked })}
                      className="mr-2"
                    />
                    <label htmlFor="anonymize" className="text-sm text-gray-600">
                      脱敏处理（隐藏用户真实信息）
                    </label>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-800">
                    ℹ️ 教师导出的数据将自动脱敏处理（隐藏用户真实信息）
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-600">时间范围:</label>
                  <input
                    type="date"
                    value={exportOptions.dateStart}
                    onChange={(e) => setExportOptions({ ...exportOptions, dateStart: e.target.value })}
                    className="border rounded px-2 py-1 text-sm"
                  />
                  <span className="text-gray-400">至</span>
                  <input
                    type="date"
                    value={exportOptions.dateEnd}
                    onChange={(e) => setExportOptions({ ...exportOptions, dateEnd: e.target.value })}
                    className="border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>

              {/* 字段预览 */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2">字段预览（前10个）</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {exportPreview.fields?.slice(0, 10).map((field: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                      <span className="font-mono text-blue-600">{field.name}</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600 truncate">{field.label}</span>
                    </div>
                  ))}
                </div>
                {exportPreview.fields?.length > 10 && (
                  <p className="text-xs text-gray-500 mt-2">
                    还有 {exportPreview.fields.length - 10} 个字段...
                  </p>
                )}
              </div>

              {/* 说明 */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <p><strong>导出格式说明:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><strong>CSV</strong>: 通用数据格式，Excel/SPSS 均可导入</li>
                  <li><strong>SAV</strong>: SPSS 原生格式，直接双击打开</li>
                  <li><strong>CSV+SPS</strong>: CSV 数据 + SPSS 语法文件</li>
                  <li>导出读取已冻结的 v2 结果；不会在导出阶段重新计分或套用旧的反向公式</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleExport}
                disabled={exportLoading}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {exportLoading ? '导出中...' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}
      {grantTarget && (
        <MaterialGrantModal
          resourceType="SCALE"
          resourceId={grantTarget.id}
          resourceName={grantTarget.name}
          onClose={() => setGrantTarget(null)}
        />
      )}
    </div>
  )
}

export default ScaleList
