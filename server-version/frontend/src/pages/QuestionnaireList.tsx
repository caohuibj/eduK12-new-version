import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient, { sessionFetch } from '../api/client'
import { Copy, Download, Edit, Eye, EyeOff, FileText, Layers, Plus, Trash2, Users, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/product-ui/PageHeader'
import { ProductPage } from '../components/product-ui/ProductPage'
import { createExportRequestKey, ExportJobFailedError, waitForExportArtifacts, type ExportArtifactRef } from '../utils/exportJobs'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED'
  estimatedTime: number | null
  createdAt: string
  updatedAt: string
  creator: {
    id: string
    username: string
    nickname: string | null
  }
  scaleCount: number
  totalItems: number
  _count: {
    assessments: number
  }
  courseQuestionnaires: Array<{
    course: {
      id: string
      title: string
    }
  }>
}

const QuestionnaireList: React.FC = () => {
  const { feedback, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportQuestionnaireId, setExportQuestionnaireId] = useState<string | null>(null)
  const [exportPreview, setExportPreview] = useState<any>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const exportRequestRef = useRef<{ signature: string; key: string } | null>(null)
  const [exportOptions, setExportOptions] = useState({
    anonymize: true,
    minProgress: 100,
    dateStart: '',
    dateEnd: '',
    format: 'csv' as 'csv' | 'sav',
  })

  useEffect(() => {
    fetchQuestionnaires()
  }, [])

  const fetchQuestionnaires = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<{ list: Questionnaire[]; total: number }>('/questionnaires')
      if (response.code === 0) {
        setQuestionnaires(response.data.list)
      } else {
        setError(response.message)
      }
    } catch (fetchError: any) {
      setError(fetchError.message || '获取问卷列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除问卷"${name}"吗？此操作不可恢复。`)) return

    try {
      const response = await apiClient.delete(`/questionnaires/${id}`)
      if (response.code === 0) {
        setQuestionnaires(current => current.filter(questionnaire => questionnaire.id !== id))
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '删除失败')
    }
  }

  const handlePublish = async (id: string) => {
    try {
      const response = await apiClient.post(`/questionnaires/${id}/publish`)
      if (response.code === 0) {
        fetchQuestionnaires()
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '发布失败')
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const response = await apiClient.post(`/questionnaires/${id}/duplicate`)
      if (response.code === 0) {
        showMessage('问卷复制成功')
        fetchQuestionnaires()
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '复制失败')
    }
  }

  const handleDeprecate = async (id: string) => {
    if (!confirm('确定要废弃此问卷吗？废弃后将不再对学生可见。')) return

    try {
      const response = await apiClient.post(`/questionnaires/${id}/deprecate`)
      if (response.code === 0) {
        fetchQuestionnaires()
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '废弃失败')
    }
  }

  const handleOpenExport = async (questionnaireId: string) => {
    setExportQuestionnaireId(questionnaireId)
    setExportLoading(true)
    try {
      const response = await apiClient.get(`/questionnaires/${questionnaireId}/export/preview`)
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
    if (!exportQuestionnaireId) return
    setExportLoading(true)
    const signature = JSON.stringify({
      resourceId: exportQuestionnaireId,
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
      const response = await apiClient.post(`/questionnaires/${exportQuestionnaireId}/export`, {
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
      const formatLabel = exportOptions.format === 'sav' ? 'SAV' : 'CSV'
      const fieldCount = response.data.fieldCount ?? exportPreview?.fields?.length ?? '-'
      showMessage(`导出成功！\n格式: ${formatLabel}\n记录数: ${response.data.recordCount}\n字段数: ${fieldCount}\n\n文件已开始下载...`)
      setShowExportModal(false)
    } catch (operationError: any) {
      if (operationError instanceof ExportJobFailedError) exportRequestRef.current = null
      showMessage(operationError.message || '导出失败')
    } finally {
      setExportLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      PUBLISHED: 'bg-green-100 text-green-800',
      DEPRECATED: 'bg-yellow-100 text-yellow-800',
    }
    const labels: Record<string, string> = {
      DRAFT: '草稿',
      PUBLISHED: '已发布',
      DEPRECATED: '已废弃',
    }
    return <span className={`rounded-full px-2 py-1 text-xs ${styles[status] || styles.DRAFT}`}>{labels[status] || status}</span>
  }

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title="聚合问卷管理"
        actions={(
          <Link to="/questionnaires/new" className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            创建问卷
          </Link>
        )}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={() => void fetchQuestionnaires()}>重试</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-500" role="status" aria-live="polite">加载中...</div>
      ) : questionnaires.length === 0 ? (
        <div className="rounded-lg bg-white py-12 text-center shadow">
          <Layers className="mx-auto mb-4 h-12 w-12 text-gray-400" aria-hidden="true" />
          <p className="mb-4 text-gray-500">暂无问卷</p>
          <Link to="/questionnaires/new" className="text-action hover:text-action/80">创建第一个问卷</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">问卷信息</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">统计</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">创建者</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">创建时间</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {questionnaires.map(questionnaire => (
                  <tr key={questionnaire.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{questionnaire.name}</div>
                        <div className="text-sm text-gray-500">{questionnaire.code}</div>
                        {questionnaire.courseQuestionnaires.length > 0 && (
                          <div className="mt-1 text-xs text-blue-600">课程: {questionnaire.courseQuestionnaires.map(item => item.course.title).join(', ')}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(questionnaire.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        <div className="flex items-center gap-1"><Layers className="h-4 w-4" aria-hidden="true" />{questionnaire.scaleCount} 个量表</div>
                        <div className="mt-1 flex items-center gap-1"><FileText className="h-4 w-4" aria-hidden="true" />{questionnaire.totalItems} 题</div>
                        <div className="mt-1 flex items-center gap-1"><Users className="h-4 w-4" aria-hidden="true" />{questionnaire._count.assessments} 测评</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{questionnaire.creator.nickname || questionnaire.creator.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(questionnaire.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/questionnaires/${questionnaire.id}`}
                          className="text-action hover:text-action/80"
                          title="编辑"
                          aria-label={`编辑 ${questionnaire.name}`}
                        >
                          <Edit className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <button type="button" onClick={() => handleDuplicate(questionnaire.id)} className="text-gray-600 hover:text-gray-800" title="复制" aria-label={`复制 ${questionnaire.name}`}>
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {questionnaire.status === 'DRAFT' && (
                          <button type="button" onClick={() => handlePublish(questionnaire.id)} className="text-green-600 hover:text-green-800" title="发布" aria-label={`发布 ${questionnaire.name}`}>
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {questionnaire.status === 'PUBLISHED' && (
                          <button type="button" onClick={() => handleDeprecate(questionnaire.id)} className="text-yellow-600 hover:text-yellow-800" title="废弃" aria-label={`废弃 ${questionnaire.name}`}>
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {questionnaire._count.assessments > 0 && (
                          <button type="button" onClick={() => handleOpenExport(questionnaire.id)} className="text-blue-600 hover:text-blue-800" title="导出数据" aria-label={`导出 ${questionnaire.name} 的测评数据`}>
                            <Download className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {questionnaire._count.assessments === 0 && questionnaire.status === 'DRAFT' && (
                          <button type="button" onClick={() => handleDelete(questionnaire.id, questionnaire.name)} className="text-red-600 hover:text-red-800" title="删除" aria-label={`删除 ${questionnaire.name}`}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="questionnaire-export-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b p-4">
              <h2 id="questionnaire-export-title" className="text-lg font-medium">导出问卷数据</h2>
              <button type="button" onClick={() => setShowExportModal(false)} aria-label="关闭导出问卷数据对话框">
                <X className="h-5 w-5 text-gray-500" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
                <div className="rounded bg-blue-50 p-3"><div className="text-2xl font-bold text-blue-600">{exportPreview.completedCount}</div><div className="text-xs text-gray-500">已完成测评</div></div>
                <div className="rounded bg-green-50 p-3"><div className="text-2xl font-bold text-green-600">{exportPreview.scaleCount}</div><div className="text-xs text-gray-500">包含量表</div></div>
                <div className="rounded bg-purple-50 p-3"><div className="text-2xl font-bold text-purple-600">{exportPreview.totalItems}</div><div className="text-xs text-gray-500">题目总数</div></div>
                <div className="rounded bg-orange-50 p-3"><div className="text-2xl font-bold text-orange-600">{exportPreview.fields?.length || 0}</div><div className="text-xs text-gray-500">导出字段</div></div>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <h3 className="font-medium text-gray-700">导出选项</h3>
                <fieldset>
                  <legend className="mb-2 text-sm text-gray-600">导出格式</legend>
                  <div className="flex flex-wrap gap-4">
                    {(['csv', 'sav'] as const).map(format => (
                      <label key={format} className="flex items-center gap-1">
                        <input type="radio" name="format" value={format} checked={exportOptions.format === format} onChange={() => setExportOptions({ ...exportOptions, format })} />
                        <span className="text-sm">{format === 'csv' ? 'CSV' : 'SAV (SPSS)'}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {isAdmin ? (
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={exportOptions.anonymize} onChange={event => setExportOptions({ ...exportOptions, anonymize: event.target.checked })} />
                    脱敏处理（隐藏用户真实信息）
                  </label>
                ) : (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">ℹ️ 教师导出的数据将自动脱敏处理（隐藏用户真实信息）</div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-gray-600">
                    <span className="mb-1 block">开始日期</span>
                    <input type="date" value={exportOptions.dateStart} onChange={event => setExportOptions({ ...exportOptions, dateStart: event.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
                  </label>
                  <label className="block text-sm text-gray-600">
                    <span className="mb-1 block">结束日期</span>
                    <input type="date" value={exportOptions.dateEnd} onChange={event => setExportOptions({ ...exportOptions, dateEnd: event.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
                  </label>
                </div>
              </div>

              {exportPreview.scales && exportPreview.scales.length > 0 && (
                <div className="rounded-lg border p-4">
                  <h3 className="mb-2 font-medium text-gray-700">包含的量表</h3>
                  <div className="space-y-2 text-sm">
                    {exportPreview.scales.map((scale: any, index: number) => (
                      <div key={scale.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-50 p-2">
                        <span className="font-medium">{index + 1}. {scale.name}</span>
                        <span className="text-gray-500">{scale.itemCount} 题 / {scale.dimensionCount} 维度</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <p><strong>导出格式说明:</strong></p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  <li><strong>CSV</strong>: 通用数据格式，Excel/SPSS 均可导入</li>
                  <li><strong>SAV</strong>: SPSS 原生格式，直接双击打开</li>
                  <li>所有量表的题目和维度合并到一张宽表</li>
                  <li>字段名格式: Q_S1_xxx（量表1题目）、D_S2_xxx（量表2维度）</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t p-4">
              <button type="button" onClick={() => setShowExportModal(false)} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">取消</button>
              <button type="button" onClick={handleExport} disabled={exportLoading} className="rounded-lg bg-action px-4 py-2 text-white hover:bg-action/90 disabled:opacity-50">
                {exportLoading ? '导出中...' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProductPage>
  )
}

export default QuestionnaireList