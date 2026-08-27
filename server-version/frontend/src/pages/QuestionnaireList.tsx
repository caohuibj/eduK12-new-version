import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { sessionFetch } from '../api/client'
import { Plus, Edit, Trash2, Eye, EyeOff, FileText, Users, Layers, GripVertical, Download, X, Copy } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

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
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // 导出相关状态
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportQuestionnaireId, setExportQuestionnaireId] = useState<string | null>(null)
  const [exportPreview, setExportPreview] = useState<any>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportOptions, setExportOptions] = useState({
    anonymize: true,
    minProgress: 100,
    dateStart: '',
    dateEnd: '',
    format: 'csv' as 'csv' | 'sav'
  })

  useEffect(() => {
    fetchQuestionnaires()
  }, [])

  const fetchQuestionnaires = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<{ list: Questionnaire[]; total: number }>('/questionnaires')
      if (response.code === 0) {
        setQuestionnaires(response.data.list)
      } else {
        setError(response.message)
      }
    } catch (err: any) {
      setError(err.message || '获取问卷列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除问卷"${name}"吗？此操作不可恢复。`)) {
      return
    }

    try {
      const response = await apiClient.delete(`/questionnaires/${id}`)
      if (response.code === 0) {
        setQuestionnaires(questionnaires.filter((q) => q.id !== id))
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  const handlePublish = async (id: string) => {
    try {
      const response = await apiClient.post(`/questionnaires/${id}/publish`)
      if (response.code === 0) {
        fetchQuestionnaires()
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '发布失败')
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const response = await apiClient.post(`/questionnaires/${id}/duplicate`)
      if (response.code === 0) {
        alert('问卷复制成功')
        fetchQuestionnaires()
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '复制失败')
    }
  }

  const handleDeprecate = async (id: string) => {
    if (!confirm('确定要废弃此问卷吗？废弃后将不再对学生可见。')) {
      return
    }

    try {
      const response = await apiClient.post(`/questionnaires/${id}/deprecate`)
      if (response.code === 0) {
        fetchQuestionnaires()
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '废弃失败')
    }
  }

  // 打开导出弹窗
  const handleOpenExport = async (questionnaireId: string) => {
    setExportQuestionnaireId(questionnaireId)
    setExportLoading(true)
    try {
      const response = await apiClient.get(`/questionnaires/${questionnaireId}/export/preview`)
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
    if (!exportQuestionnaireId) return
    setExportLoading(true)
    try {
      const response = await apiClient.post(`/questionnaires/${exportQuestionnaireId}/export`, {
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
        // 下载文件
        const fileUrl = `/api/questionnaires/exports/${response.data.fileName}`
        sessionFetch(fileUrl)
          .then(res => res.blob())
          .then(blob => {
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = response.data.fileName
            a.click()
            window.URL.revokeObjectURL(url)
          })
        
        const formatLabel = exportOptions.format === 'sav' ? 'SAV' : 'CSV'
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
    }
    const labels: Record<string, string> = {
      DRAFT: '草稿',
      PUBLISHED: '已发布',
      DEPRECATED: '已废弃',
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
        <h1 className="text-2xl font-bold text-gray-900">聚合问卷管理</h1>
        <Link
          to="/questionnaires/new"
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          创建问卷
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {questionnaires.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">暂无问卷</p>
          <Link
            to="/questionnaires/new"
            className="text-primary hover:text-primary/80"
          >
            创建第一个问卷
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  问卷信息
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
              {questionnaires.map((qn) => (
                <tr key={qn.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{qn.name}</div>
                      <div className="text-sm text-gray-500">{qn.code}</div>
                      {qn.courseQuestionnaires.length > 0 && (
                        <div className="text-xs text-blue-600 mt-1">
                          课程: {qn.courseQuestionnaires.map(cq => cq.course.title).join(', ')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(qn.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Layers className="w-4 h-4" />
                        {qn.scaleCount} 个量表
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <FileText className="w-4 h-4" />
                        {qn.totalItems} 题
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Users className="w-4 h-4" />
                        {qn._count.assessments} 测评
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {qn.creator.nickname || qn.creator.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(qn.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/questionnaires/${qn.id}`}
                        className="text-primary hover:text-primary/80"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDuplicate(qn.id)}
                        className="text-gray-600 hover:text-gray-800"
                        title="复制"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {qn.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePublish(qn.id)}
                          className="text-green-600 hover:text-green-800"
                          title="发布"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {qn.status === 'PUBLISHED' && (
                        <button
                          onClick={() => handleDeprecate(qn.id)}
                          className="text-yellow-600 hover:text-yellow-800"
                          title="废弃"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      )}
                      {qn._count.assessments > 0 && (
                        <button
                          onClick={() => handleOpenExport(qn.id)}
                          className="text-blue-600 hover:text-blue-800"
                          title="导出数据"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      {qn._count.assessments === 0 && qn.status === 'DRAFT' && (
                        <button
                          onClick={() => handleDelete(qn.id, qn.name)}
                          className="text-red-600 hover:text-red-800"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
              <h3 className="text-lg font-medium">导出问卷数据</h3>
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
                  <div className="text-2xl font-bold text-green-600">{exportPreview.scaleCount}</div>
                  <div className="text-xs text-gray-500">包含量表</div>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <div className="text-2xl font-bold text-purple-600">{exportPreview.totalItems}</div>
                  <div className="text-xs text-gray-500">题目总数</div>
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

              {/* 包含的量表 */}
              {exportPreview.scales && exportPreview.scales.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-2">包含的量表</h4>
                  <div className="space-y-2 text-sm">
                    {exportPreview.scales.map((scale: any, index: number) => (
                      <div key={scale.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span className="font-medium">{index + 1}. {scale.name}</span>
                        <span className="text-gray-500">
                          {scale.itemCount} 题 / {scale.dimensionCount} 维度
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 说明 */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                <p><strong>导出格式说明:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><strong>CSV</strong>: 通用数据格式，Excel/SPSS 均可导入</li>
                  <li><strong>SAV</strong>: SPSS 原生格式，直接双击打开</li>
                  <li>所有量表的题目和维度合并到一张宽表</li>
                  <li>字段名格式: Q_S1_xxx（量表1题目）、D_S2_xxx（量表2维度）</li>
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
    </div>
  )
}

export default QuestionnaireList
