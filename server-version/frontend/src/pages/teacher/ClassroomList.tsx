import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { Plus, Edit, Trash2, Users, BookOpen, QrCode, ExternalLink, Copy, Download } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

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
  const navigate = useNavigate()
  const { user } = useAuth()

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<string>('')

  // 获取课堂列表
  const fetchClassrooms = async () => {
    try {
      setLoading(true)
      const params = courseId ? `?courseId=${courseId}` : ''
      const response = await apiClient.get<{ list: Classroom[]; total: number }>(`/classrooms${params}`)
      if (response.code === 0) {
        setClassrooms(response.data.list)
      } else {
        setError(response.message)
      }
    } catch (err: any) {
      setError(err.message || '获取课堂列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClassrooms()
  }, [courseId])

  // 删除课堂
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除课堂"${name}"吗？此操作不可恢复。`)) {
      return
    }

    try {
      const response = await apiClient.delete(`/classrooms/${id}`)
      if (response.code === 0) {
        setClassrooms(classrooms.filter((c) => c.id !== id))
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  // 复制课堂
  const handleDuplicate = async (id: string, name: string) => {
    if (!confirm(`确定要复制课堂"${name}"吗？\n\n将创建一个新课堂，包含相同的题目。`)) {
      return
    }

    try {
      const response = await apiClient.post(`/classrooms/${id}/duplicate`)
      if (response.code === 0) {
        alert('课堂复制成功！新课堂码: ' + response.data.code)
        fetchClassrooms() // 刷新列表
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '复制失败')
    }
  }

  // 导出课堂数据
  const handleExport = async (classroom: Classroom) => {
    try {
      const response = await apiClient.get<any>(`/classrooms/${classroom.id}/export`)
      if (response.code === 0) {
        const data = response.data
        
        // 转换为 CSV 格式
        let csvContent = '\uFEFF' // UTF-8 BOM
        
        // 课堂信息
        csvContent += '课堂信息\n'
        csvContent += `课堂名称,${data.classroom.name}\n`
        csvContent += `课堂码,${data.classroom.code}\n`
        csvContent += `课程,${data.classroom.course}\n`
        csvContent += `创建时间,${data.classroom.createdAt}\n`
        csvContent += `状态,${data.classroom.status}\n`
        csvContent += '\n'
        
        // 统计信息
        csvContent += '统计信息\n'
        csvContent += `题目总数,${data.summary.totalQuestions}\n`
        csvContent += `答案总数,${data.summary.totalAnswers}\n`
        csvContent += `参与学生数,${data.summary.uniqueStudents}\n`
        csvContent += '\n'
        
        // 题目列表
        csvContent += '题目列表\n'
        csvContent += '题号,题目类型,题目内容,开始时间,结束时间\n'
        data.questions.forEach((q: any) => {
          const content = q.content
          const questionText = content.question?.replace(/"/g, '""') || ''
          csvContent += `${q.index},${content.type},"${questionText}",${q.startedAt || ''},${q.endedAt || ''}\n`
        })
        csvContent += '\n'
        
        // 答题记录
        csvContent += '答题记录\n'
        csvContent += '题号,学生姓名,答案,提交时间\n'
        data.answers.forEach((a: any) => {
          const answerText = typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer)
          csvContent += `${a.questionIndex},${a.studentName},"${answerText.replace(/"/g, '""')}",${a.submittedAt}\n`
        })
        
        // 创建下载
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `课堂_${classroom.name}_数据_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        
        alert('数据导出成功！')
      } else {
        alert('导出失败: ' + response.message)
      }
    } catch (err: any) {
      alert('导出失败: ' + (err.message || '未知错误'))
    }
  }

  // 获取状态标签
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
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.PREPARING}`}>
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
        <h1 className="text-2xl font-bold text-gray-900">课堂管理</h1>
        <Link
          to="/teacher/classrooms/create"
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          创建课堂
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {classrooms.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">暂无课堂</p>
          <Link
            to="/teacher/classrooms/create"
            className="text-primary hover:text-primary/80"
          >
            创建第一个课堂
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  课堂信息
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  统计
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  课程
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
              {classrooms.map((classroom) => (
                <tr key={classroom.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{classroom.name}</div>
                      <div className="text-sm text-gray-500">课堂码: {classroom.code}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(classroom.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {classroom._count.sessions} 学生
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <BookOpen className="w-4 h-4" />
                        {classroom._count.questions} 题目
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {classroom.course.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(classroom.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      {/* 复制按钮 - 所有状态都可使用 */}
                      <button
                        onClick={() => handleDuplicate(classroom.id, classroom.name)}
                        className="text-purple-600 hover:text-purple-800"
                        title="复制课堂"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* 导出数据按钮 - 已结束的课堂 */}
                      {classroom.status === 'ENDED' && (
                        <button
                          onClick={() => handleExport(classroom)}
                          className="text-green-600 hover:text-green-800"
                          title="导出数据"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}

                      {classroom.status === 'PREPARING' && (
                        <>
                          <Link
                            to={`/teacher/classrooms/${classroom.id}/control`}
                            className="text-green-600 hover:text-green-800"
                            title="进入控制面板"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => window.open(`/teacher/classrooms/${classroom.id}/qrcode`, '_blank', 'width=600,height=700')}
                            className="text-blue-600 hover:text-blue-800"
                            title="查看二维码"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {classroom.status === 'ACTIVE' && (
                        <Link
                          to={`/teacher/classrooms/${classroom.id}/control`}
                          className="text-green-600 hover:text-green-800"
                          title="进入控制面板"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      )}
                      {classroom.status === 'PREPARING' && (
                        <>
                          <Link
                            to={`/teacher/classrooms/${classroom.id}/edit`}
                            className="text-primary hover:text-primary/80"
                            title="编辑"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(classroom.id, classroom.name)}
                            className="text-red-600 hover:text-red-800"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
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
      )}
    </div>
  )
}

export default ClassroomList
