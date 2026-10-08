import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Key, Lock, Search, Unlock, Users, UserX } from 'lucide-react'
import apiClient from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { isTrainingHost } from '../training/context'
import { PageHeader } from '../components/product-ui/PageHeader'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'
import { ProductPage } from '../components/product-ui/ProductPage'
import type { Course } from '../types'

interface Student {
  id: string
  username: string
  nickname: string
  avatarUrl?: string
  isFrozen: boolean
  joinedAt: string
}

const CourseStudents: React.FC = () => {
  const { feedback, confirm, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const ask = (message: string) => confirm({ title: '确认操作', body: message, confirmLabel: '确认' })
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const canManageGlobalAccount = user?.role === 'ADMIN'
  const training = isTrainingHost()
  const [course, setCourse] = useState<Course | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    if (courseId) {
      fetchCourseDetail()
      fetchStudents()
    }
  }, [courseId])

  const fetchCourseDetail = async () => {
    try {
      const response = await apiClient.get(`/courses/${courseId}`)
      if (response.code === 0) {
        setCourse(response.data)
      } else {
        setError(current => current || response.message || '获取课程详情失败')
      }
    } catch (fetchError) {
      console.error('获取课程详情失败:', fetchError)
      setError(current => current || (fetchError as { message?: string }).message || '获取课程详情失败')
    }
  }

  const fetchStudents = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get(`/courses/${courseId}/students`)
      if (response.code === 0) {
        setStudents(response.data.list)
      } else {
        setError(response.message || '获取学生列表失败')
      }
    } catch (fetchError) {
      console.error('获取学生列表失败:', fetchError)
      setError((fetchError as { message?: string }).message || '获取学生列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFreeze = async (student: Student) => {
    if (!await ask(student.isFrozen ? '确定要解冻该学生账号吗？' : '确定要冻结该学生账号吗？')) return

    setProcessingId(student.id)
    try {
      const response = await apiClient.put(`/courses/${courseId}/students/${student.id}/freeze`, {
        isFrozen: !student.isFrozen,
      })
      if (response.code === 0) {
        setStudents(current => current.map(item => item.id === student.id ? { ...item, isFrozen: !item.isFrozen } : item))
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '操作失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleResetPassword = async (student: Student) => {
    if (!await ask(`确定要为 ${student.nickname} 生成一次性临时密码吗？\n\n临时密码只会写入受保护的本地交接文件。`)) return

    setProcessingId(student.id)
    try {
      const response = await apiClient.post(`/courses/${courseId}/students/${student.id}/reset-password`)
      if (response.code === 0) {
        showMessage(response.message || `已为 ${student.nickname} 生成一次性临时密码，请从受保护的本地交接文件中读取。`)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '重置密码失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleRemoveStudent = async (student: Student) => {
    if (!await ask(`确定要将 ${student.nickname} 从课程中移除吗？\n\n注意：此操作不会删除学生账号，只是将其从本课程中移除。`)) return

    setProcessingId(student.id)
    try {
      const response = await apiClient.delete(`/courses/${courseId}/students/${student.id}`)
      if (response.code === 0) {
        setStudents(current => current.filter(item => item.id !== student.id))
        showMessage('学生已从课程中移除')
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '移除学生失败')
    } finally {
      setProcessingId(null)
    }
  }

  const filteredStudents = students.filter(student => (
    student.nickname?.toLowerCase().includes(keyword.toLowerCase())
    || student.username?.toLowerCase().includes(keyword.toLowerCase())
  ))

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('zh-CN')

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title={course?.title || (training ? '课程学员管理' : '课程学生管理')}
        description={`课程码: ${course?.courseCode || '—'} · 共 ${students.length} 名${training ? '学员' : '学生'}`}
        actions={(
          <Link to={training && courseId ? `/courses/${encodeURIComponent(courseId)}/detail` : '/courses'} className="btn-secondary inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />返回课程
          </Link>
        )}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                void fetchCourseDetail()
                void fetchStudents()
              }}
            >
              重试
            </button>
          </div>
        </div>
      )}

      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium text-gray-700">搜索学生</span>
        <span className="relative block">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="姓名或账号"
            className="input w-full pl-10"
          />
        </span>
      </label>

      {loading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-action" />
          <span className="sr-only">正在加载课程学生</span>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="rounded-lg bg-white py-12 text-center shadow">
          <Users className="mx-auto mb-4 h-16 w-16 text-gray-300" aria-hidden="true" />
          <p className="text-gray-500">{keyword ? '未找到匹配的学生' : '该课程暂无学生'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">学生信息</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">账号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">加入时间</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredStudents.map(student => (
                  <tr key={student.id} className={student.isFrozen ? 'bg-gray-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          {student.avatarUrl ? (
                            <img className="h-10 w-10 rounded-full" src={student.avatarUrl} alt="" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-action/10">
                              <span className="font-medium text-action">{student.nickname?.charAt(0) || '?'}</span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className={`text-sm font-medium ${student.isFrozen ? 'text-gray-500' : 'text-gray-900'}`}>
                            {student.nickname}
                            {student.isFrozen && (
                              <span className="ml-2 inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                                <Lock className="mr-1 h-3 w-3" aria-hidden="true" />已冻结
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ${student.isFrozen ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {student.isFrozen ? '已冻结' : '正常'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(student.joinedAt)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {canManageGlobalAccount && <button
                          type="button"
                          onClick={() => handleToggleFreeze(student)}
                          disabled={processingId === student.id}
                          className={`rounded p-2 ${student.isFrozen ? 'text-green-600 hover:bg-green-50' : 'text-orange-600 hover:bg-orange-50'} disabled:opacity-50`}
                          title={student.isFrozen ? '解冻账号' : '冻结账号'}
                          aria-label={student.isFrozen ? `解冻 ${student.nickname} 的账号` : `冻结 ${student.nickname} 的账号`}
                        >
                          {student.isFrozen ? <Unlock className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                        </button>}
                        {canManageGlobalAccount && <button
                          type="button"
                          onClick={() => handleResetPassword(student)}
                          disabled={processingId === student.id}
                          className="rounded p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                          title="重置密码"
                          aria-label={`为 ${student.nickname} 生成一次性临时密码`}
                        >
                          <Key className="h-4 w-4" aria-hidden="true" />
                        </button>}
                        <button
                          type="button"
                          onClick={() => handleRemoveStudent(student)}
                          disabled={processingId === student.id}
                          className="rounded p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="从课程中移除"
                          aria-label={`将 ${student.nickname} 从课程中移除`}
                        >
                          <UserX className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-800">{students.length}</div>
          <div className="text-sm text-gray-500">总学生数</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">{students.filter(student => !student.isFrozen).length}</div>
          <div className="text-sm text-gray-500">正常账号</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-red-600">{students.filter(student => student.isFrozen).length}</div>
          <div className="text-sm text-gray-500">已冻结</div>
        </div>
      </div>
    </ProductPage>
  )
}

export default CourseStudents