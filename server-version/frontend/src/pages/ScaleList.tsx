import ModalSurface from '../components/shared-ui/ModalSurface'
import { useEditorGuard } from '../components/shared-ui/useEditorGuard'
import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import apiClient, { sessionFetch } from '../api/client'
import { Plus, Edit, Trash2, Eye, EyeOff, FileText, Users, ClipboardList, Download, X, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import TagBadge from '../components/TagBadge'
import TagFilter from '../components/TagFilter'
import MaterialGrantModal from '../components/MaterialGrantModal'
import { PageHeader } from '../components/product-ui/PageHeader'
import { ProductPage } from '../components/product-ui/ProductPage'
import { createExportRequestKey, ExportJobFailedError, waitForExportArtifacts, type ExportArtifactRef } from '../utils/exportJobs'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

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
    ? scale.definition.scoring.scores.filter(score => score.type === 'dimension').length
    : 0
)

const ScaleList: React.FC = () => {
  const { feedback, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [scales, setScales] = useState<Scale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportScaleId, setExportScaleId] = useState<string | null>(null)
  const [exportPreview, setExportPreview] = useState<any>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const exportRequestRef = useRef<{ signature: string; key: string } | null>(null)
  const [exportOptions, setExportOptions] = useState({
    anonymize: true,
    minProgress: 100,
    dateStart: '',
    dateEnd: '',
    format: 'csv' as 'csv' | 'sav' | 'spss',
  })
  const [grantTarget, setGrantTarget] = useState<Scale | null>(null)

  const exportGuard = useEditorGuard({ open: showExportModal, value: exportOptions, externalBusy: exportLoading, onClose: () => setShowExportModal(false) })

  useEffect(() => {
    fetchScales()
    fetchTags()
  }, [])

  const fetchScales = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<{ list: Scale[]; total: number }>('/scales?page=1&pageSize=100')
      if (response.code === 0) {
        setScales(response.data.list)
      } else {
        setError(response.message)
      }
    } catch (fetchError: any) {
      setError(fetchError.message || '获取量表列表失败')
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
    } catch (fetchError) {
      console.error('获取标签列表失败:', fetchError)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除量表"${name}"吗？此操作不可恢复。`)) return

    try {
      const response = await apiClient.delete(`/scales/${id}`)
      if (response.code === 0) {
        setScales(current => current.filter(scale => scale.id !== id))
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '删除失败')
    }
  }

  const handlePublish = async (id: string) => {
    try {
      const response = await apiClient.post(`/scales/${id}/publish`)
      if (response.code === 0) {
        fetchScales()
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '发布失败')
    }
  }

  const handleDeprecate = async (id: string) => {
    if (!confirm('确定要废弃此量表吗？废弃后将不再对学生可见。')) return

    try {
      const response = await apiClient.post(`/scales/${id}/deprecate`)
      if (response.code === 0) {
        fetchScales()
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '废弃失败')
    }
  }

  const handleOpenExport = async (scaleId: string) => {
    setExportScaleId(scaleId)
    setExportLoading(true)
    try {
      const response = await apiClient.get(`/scales/${scaleId}/export/preview`)
      if (response.code === 0) {
        setExportPreview(response.data)
        setShowExportModal(true)
      } else {
        showMessage(response.message || '获取预览失败')
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '获取预览失败')
    } finally {
      setExportLoading(false)
    }
  }

  const handleExport = async () => {
    if (!exportScaleId) return
    if (!exportGuard.begin()) return
    setExportLoading(true)
    const signature = JSON.stringify({
      resourceId: exportScaleId,
      anonymize: exportOptions.anonymize,
      minProgress: exportOptions.minProgress,
      dateStart: exportOptions.dateStart,
      dateEnd: exportOptions.dateEnd,
      format: exportOptions.format,
    })
    if (!exportRequestRef.current || exportRequestRef.current.signature !== signature) {
      exportRequestRef.current = { signature, key: createExportRequestKey() }
    }

    try {
      const response = await apiClient.post(`/scales/${exportScaleId}/export`, {
        anonymize: exportOptions.anonymize,
        minProgress: exportOptions.minProgress,
        dateRange: {
          start: exportOptions.dateStart || undefined,
          end: exportOptions.dateEnd || undefined,
        },
        format: exportOptions.format,
        requestKey: exportRequestRef.current.key,
      })

      if (response.code !== 0) throw new Error(response.message || '导出失败')
      const artifacts = Array.isArray(response.data.artifacts)
        ? response.data.artifacts as ExportArtifactRef[]
        : []
      const readyArtifacts = await waitForExportArtifacts(artifacts)

      for (const artifact of readyArtifacts) {
        const downloadResponse = await sessionFetch(artifact.downloadUrl)
        if (!downloadResponse.ok) throw new Error('导出文件下载失败')
        const blob = await downloadResponse.blob()
        const url = window.URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = artifact.fileName
        anchor.click()
        window.URL.revokeObjectURL(url)
      }

      exportRequestRef.current = null
      const formatLabel = exportOptions.format === 'sav' ? 'SAV' : exportOptions.format === 'spss' ? 'CSV+SPS' : 'CSV'
      const fieldCount = response.data.fieldCount ?? exportPreview?.fields?.length ?? '-'
      showMessage(`导出成功！\n格式: ${formatLabel}\n记录数: ${response.data.recordCount}\n字段数: ${fieldCount}\n\n文件已开始下载...`)
      setShowExportModal(false)
    } catch (operationError: any) {
      if (operationError instanceof ExportJobFailedError) exportRequestRef.current = null
      exportGuard.fail(String(operationError.message || '导出失败'))
    } finally {
      exportGuard.finish()
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
    return <span className={`rounded-full px-2 py-1 text-xs ${styles[status] || styles.DRAFT}`}>{labels[status] || status}</span>
  }

  const filteredScales = scales.filter(scale => (
    selectedTags.length === 0 || selectedTags.some(tag => scale.tags?.includes(tag))
  ))

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title="心理量表管理"
        actions={(
          <Link to="/scales/new" className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            创建量表
          </Link>
        )}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={() => void fetchScales()}>重试</button>
          </div>
        </div>
      )}

      {availableTags.length > 0 && (
        <TagFilter
          availableTags={availableTags}
          selectedTags={selectedTags}
          onChange={setSelectedTags}
          title="标签筛选"
        />
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-500" role="status" aria-live="polite">加载中...</div>
      ) : scales.length === 0 ? (
        <div className="rounded-lg bg-white py-12 text-center shadow">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400" aria-hidden="true" />
          <p className="mb-4 text-gray-500">暂无量表</p>
          <Link to="/scales/new" className="text-action hover:text-action/80">创建第一个量表</Link>
        </div>
      ) : filteredScales.length === 0 ? (
        <div className="rounded-lg bg-white py-12 text-center shadow text-gray-500">没有符合当前标签筛选条件的量表。</div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">量表信息</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">统计</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">创建者</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">创建时间</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredScales.map(scale => (
                  <tr key={scale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-gray-900">{scale.name}</div>
                          {scale.source === 'granted' && (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">管理员授权 · 只读</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{scale.code}</div>
                        <div className="mt-1 text-xs text-gray-400">
                          {scale.instrumentClass === 'STANDARD' ? 'STANDARD package · 只读' : '自定义量表 · 描述性结果'}
                          {scale.instrumentVersion ? ` · v${scale.instrumentVersion}` : ''}
                        </div>
                        {scale.courseScales && scale.courseScales.length > 0 && (
                          <div className="mt-1 text-xs text-blue-600">课程: {scale.courseScales.map(courseScale => courseScale.course.title).join('、')}</div>
                        )}
                        {scale.tags && scale.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {scale.tags.map((tag, index) => <TagBadge key={index} tag={tag} />)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(scale.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        <div className="flex items-center gap-1"><ClipboardList className="h-4 w-4" aria-hidden="true" />{v2ItemCount(scale)} 题</div>
                        <div className="mt-1 flex items-center gap-1"><FileText className="h-4 w-4" aria-hidden="true" />{v2DimensionCount(scale)} 维度</div>
                        <div className="mt-1 flex items-center gap-1"><Users className="h-4 w-4" aria-hidden="true" />{scale._count?.assessments ?? 0} 测评</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{scale.creator.nickname || scale.creator.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(scale.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {scale.source === 'granted' ? (
                          <span className="text-xs text-gray-400">只读</span>
                        ) : (
                          <>
                            <Link
                              to={`/scales/${scale.id}`}
                              className="text-action hover:text-action/80"
                              title="编辑"
                              aria-label={`编辑 ${scale.name}`}
                            >
                              <Edit className="h-4 w-4" aria-hidden="true" />
                            </Link>
                            {scale.status === 'DRAFT' && scale.instrumentClass !== 'STANDARD' && (
                              <button type="button" onClick={() => handlePublish(scale.id)} className="text-green-600 hover:text-green-800" title="发布" aria-label={`发布 ${scale.name}`}>
                                <Eye className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            {scale.status === 'PUBLISHED' && (
                              <button type="button" onClick={() => handleDeprecate(scale.id)} className="text-yellow-600 hover:text-yellow-800" title="废弃" aria-label={`废弃 ${scale.name}`}>
                                <EyeOff className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            {(scale._count?.assessments ?? 0) > 0 && (
                              <button type="button" onClick={() => handleOpenExport(scale.id)} className="text-blue-600 hover:text-blue-800" title="导出数据" aria-label={`导出 ${scale.name} 的测评数据`}>
                                <Download className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            {(scale._count?.assessments ?? 0) === 0 && scale.status === 'DRAFT' && scale.instrumentClass !== 'STANDARD' && (
                              <button type="button" onClick={() => handleDelete(scale.id, scale.name)} className="text-red-600 hover:text-red-800" title="删除" aria-label={`删除 ${scale.name}`}>
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            {isAdmin && scale.status === 'PUBLISHED' && (
                              <button type="button" onClick={() => setGrantTarget(scale)} className="text-indigo-600 hover:text-indigo-800" title="授权给教师" aria-label={`将 ${scale.name} 授权给教师`}>
                                <UserPlus className="h-4 w-4" aria-hidden="true" />
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
        </div>
      )}

      {showExportModal && exportPreview && (
        <ModalSurface open onClose={exportGuard.close} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scale-export-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl"
          >{exportGuard.error}<fieldset disabled={exportGuard.busy} className="contents">
            <div className="flex items-center justify-between border-b p-4">
              <h2 id="scale-export-title" className="text-lg font-medium">导出测评数据</h2>
              <button type="button" disabled={exportGuard.busy} onClick={exportGuard.close} aria-label="关闭导出测评数据对话框">
                <X className="h-5 w-5 text-gray-500" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
                <div className="rounded bg-blue-50 p-3"><div className="text-2xl font-bold text-blue-600">{exportPreview.completedCount}</div><div className="text-xs text-gray-500">已完成测评</div></div>
                <div className="rounded bg-green-50 p-3"><div className="text-2xl font-bold text-green-600">{exportPreview.itemCount}</div><div className="text-xs text-gray-500">题目数量</div></div>
                <div className="rounded bg-purple-50 p-3"><div className="text-2xl font-bold text-purple-600">{exportPreview.dimensionCount}</div><div className="text-xs text-gray-500">维度数量</div></div>
                <div className="rounded bg-orange-50 p-3"><div className="text-2xl font-bold text-orange-600">{exportPreview.fields?.length || 0}</div><div className="text-xs text-gray-500">导出字段</div></div>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <h3 className="font-medium text-gray-700">导出选项</h3>
                <fieldset>
                  <legend className="mb-2 text-sm text-gray-600">导出格式</legend>
                  <div className="flex flex-wrap gap-4">
                    {(['csv', 'sav', 'spss'] as const).map(format => (
                      <label key={format} className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="format"
                          value={format}
                          checked={exportOptions.format === format}
                          onChange={() => setExportOptions({ ...exportOptions, format })}
                        />
                        <span className="text-sm">{format === 'csv' ? 'CSV' : format === 'sav' ? 'SAV (SPSS)' : 'CSV + SPS'}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {isAdmin ? (
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={exportOptions.anonymize}
                      onChange={event => setExportOptions({ ...exportOptions, anonymize: event.target.checked })}
                    />
                    脱敏处理（隐藏用户真实信息）
                  </label>
                ) : (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
                    ℹ️ 教师导出的数据将自动脱敏处理（隐藏用户真实信息）
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-gray-600">
                    <span className="mb-1 block">开始日期</span>
                    <input
                      type="date"
                      value={exportOptions.dateStart}
                      onChange={event => setExportOptions({ ...exportOptions, dateStart: event.target.value })}
                      className="w-full rounded border px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    <span className="mb-1 block">结束日期</span>
                    <input
                      type="date"
                      value={exportOptions.dateEnd}
                      onChange={event => setExportOptions({ ...exportOptions, dateEnd: event.target.value })}
                      className="w-full rounded border px-2 py-1 text-sm"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-2 font-medium text-gray-700">字段预览（前10个）</h3>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  {exportPreview.fields?.slice(0, 10).map((field: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 rounded bg-gray-50 p-2">
                      <span className="font-mono text-blue-600">{field.name}</span>
                      <span className="text-gray-400">|</span>
                      <span className="truncate text-gray-600">{field.label}</span>
                    </div>
                  ))}
                </div>
                {exportPreview.fields?.length > 10 && <p className="mt-2 text-xs text-gray-500">还有 {exportPreview.fields.length - 10} 个字段...</p>}
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <p><strong>导出格式说明:</strong></p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  <li><strong>CSV</strong>: 通用数据格式，Excel/SPSS 均可导入</li>
                  <li><strong>SAV</strong>: SPSS 原生格式，直接双击打开</li>
                  <li><strong>CSV+SPS</strong>: CSV 数据 + SPSS 语法文件</li>
                  <li>导出读取已冻结的 v2 结果；不会在导出阶段重新计分或套用旧的反向公式</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t p-4">
              <button type="button" disabled={exportGuard.busy} onClick={exportGuard.close} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">取消</button>
              <button type="button" onClick={handleExport} disabled={exportLoading} className="rounded-lg bg-action px-4 py-2 text-white hover:bg-action/90 disabled:opacity-50">
                {exportLoading ? '导出中...' : '确认导出'}
              </button>
            </div>
          </fieldset></div>
        </ModalSurface>
      )}

      {grantTarget && (
        <MaterialGrantModal
          resourceType="SCALE"
          resourceId={grantTarget.id}
          resourceName={grantTarget.name}
          onClose={() => setGrantTarget(null)}
        />
      )}
      {exportGuard.confirmation}
    </ProductPage>
  )
}

export default ScaleList