import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { BookOpen, Copy, Download, Edit, ExternalLink, Plus, QrCode, Trash2, Users } from 'lucide-react'
import { PageHeader } from '../../components/product-ui/PageHeader'
import { ProductPage } from '../../components/product-ui/ProductPage'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

interface Classroom {
  id: string
  code: string
  name: string
  status: 'PREPARING' | 'ACTIVE' | 'ENDED'
  createdAt: string
  course: {
    id: string
    title: string
  }
  creator: {
    id: string
    username: string
    nickname: string | null
  }
  _count: {
    sessions: number
    questions: number
  }
}

const ClassroomList: React.FC = () => {
  const { feedback, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClassrooms = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get<{ list: Classroom[]; total: number }>('/classrooms')
      if (response.code === 0) {
        setClassrooms(response.data.list)
      } else {
        setError(response.message || '获取课堂列表失败')
      }
    } catch (fetchError: any) {
      setError(fetchError.message || '获取课堂列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchClassrooms()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除课堂"${name}"吗？此操作不可恢复。`)) return

    try {
      const response = await apiClient.delete(`/classrooms/${id}`)
      if (response.code === 0) {
        setClassrooms(current => current.filter(classroom => classroom.id !== id))
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '删除失败')
    }
  }

  const handleDuplicate = async (id: string, name: string) => {
    if (!confirm(`确定要复制课堂"${name}"吗？\n\n将创建一个新课堂，包含相同的题目。`)) return

    try {
      const response = await apiClient.post(`/classrooms/${id}/duplicate`)
      if (response.code === 0) {
        showMessage('课堂复制成功！新课堂码: ' + response.data.code)
        void fetchClassrooms()
      } else {
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '复制失败')
    }
  }

  const handleExport = async (classroom: Classroom) => {
    try {
      const response = await apiClient.get<any>(`/classrooms/${classroom.id}/export`)
      if (response.code === 0) {
        const data = response.data
        let csvContent = '\uFEFF'
        csvContent += '课堂信息\n'
        csvContent += `课堂名称,${data.classroom.name}\n`
        csvContent += `课堂码,${data.classroom.code}\n`
        csvContent += `课程,${data.classroom.course}\n`
        csvContent += `创建时间,${data.classroom.createdAt}\n`
        csvContent += `状态,${data.classroom.status}\n\n`
        csvContent += '统计信息\n'
        csvContent += `题目总数,${data.summary.totalQuestions}\n`
        csvContent += `答案总数,${data.summary.totalAnswers}\n`
        csvContent += `参与学生数,${data.summary.uniqueStudents}\n\n`
        csvContent += '题目列表\n'
        csvContent += '题号,题目类型,题目内容,开始时间,结束时间\n'
        data.questions.forEach((question: any) => {
          const content = question.content
          const questionText = content.question?.replace(/"/g, '""') || ''
          csvContent += `${question.index},${content.type},"${questionText}",${question.startedAt || ''},${question.endedAt || ''}\n`
        })
        csvContent += '\n答题记录\n'
        csvContent += '题号,学生姓名,答案,提交时间\n'
        data.answers.forEach((answer: any) => {
          const answerText = typeof answer.answer === 'string' ? answer.answer : JSON.stringify(answer.answer)
          csvContent += `${answer.questionIndex},${answer.studentName},"${answerText.replace(/"/g, '""')}",${answer.submittedAt}\n`
        })

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `课堂_${classroom.name}_数据_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        showMessage('数据导出成功！')
      } else {
        showMessage('导出失败: ' + response.message)
      }
    } catch (operationError: any) {
      showMessage('导出失败: ' + (operationError.message || '未知错误'))
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PREPARING: 'bg-yellow-100 text-yellow-800',
      ACTIVE: 'bg-green-100 text-green-800',
      ENDED: 'bg-gray-100 text-gray-800',
    }
    const labels: Record<string, string> = {
      PREPARING: '准备中',
      ACTIVE: '进行中',
      ENDED: '已结束',
    }
    return <span className={`rounded-full px-2 py-1 text-xs ${styles[status] || styles.PREPARING}`}>{labels[status] || status}</span>
  }

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title="课堂管理"
        description="创建课堂、进入控制面板，并管理已结束课堂的数据导出。"
        actions={(
          <Link to="/teacher/classrooms/create" className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />创建课堂
          </Link>
        )}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={() => void fetchClassrooms()}>重试</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-500" role="status" aria-live="polite">加载中...</div>
      ) : classrooms.length === 0 ? (
        <div className="rounded-lg bg-white py-12 text-center shadow">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-400" aria-hidden="true" />
          <p className="mb-4 text-gray-500">暂无课堂</p>
          <Link to="/teacher/classrooms/create" className="text-primary hover:text-primary/80">创建第一个课堂</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">课堂信息</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">统计</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">课程</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">创建时间</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {classrooms.map(classroom => (
                  <tr key={classroom.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{classroom.name}</div>
                      <div className="text-sm text-gray-500">课堂码: <span className="font-mono">{classroom.code}</span></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(classroom.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        <div className="flex items-center gap-1"><Users className="h-4 w-4" aria-hidden="true" />{classroom._count.sessions} 学生</div>
                        <div className="mt-1 flex items-center gap-1"><BookOpen className="h-4 w-4" aria-hidden="true" />{classroom._count.questions} 题目</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{classroom.course.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(classroom.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => handleDuplicate(classroom.id, classroom.name)} className="text-purple-600 hover:text-purple-800" title="复制课堂" aria-label={`复制课堂 ${classroom.name}`}>
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {classroom.status === 'ENDED' && (
                          <button type="button" onClick={() => handleExport(classroom)} className="text-green-600 hover:text-green-800" title="导出数据" aria-label={`导出课堂 ${classroom.name} 的数据`}>
                            <Download className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {(classroom.status === 'PREPARING' || classroom.status === 'ACTIVE') && (
                          <Link to={`/teacher/classrooms/${classroom.id}/control`} className="text-green-600 hover:text-green-800" title="进入控制面板" aria-label={`进入 ${classroom.name} 控制面板`}>
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        )}
                        {classroom.status === 'PREPARING' && (
                          <>
                            <button
                              type="button"
                              onClick={() => window.open(`/teacher/classrooms/${classroom.id}/qrcode`, '_blank', 'width=600,height=700')}
                              className="text-blue-600 hover:text-blue-800"
                              title="查看二维码"
                              aria-label={`查看 ${classroom.name} 的课堂二维码`}
                            >
                              <QrCode className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <Link to={`/teacher/classrooms/${classroom.id}/edit`} className="text-primary hover:text-primary/80" title="编辑" aria-label={`编辑课堂 ${classroom.name}`}>
                              <Edit className="h-4 w-4" aria-hidden="true" />
                            </Link>
                            <button type="button" onClick={() => handleDelete(classroom.id, classroom.name)} className="text-red-600 hover:text-red-800" title="删除" aria-label={`删除课堂 ${classroom.name}`}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
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
    </ProductPage>
  )
}

export default ClassroomList