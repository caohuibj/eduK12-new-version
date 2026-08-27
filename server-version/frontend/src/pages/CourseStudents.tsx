import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Lock, Unlock, Key, Trash2, Users, UserX } from 'lucide-react'
import apiClient from '../api/client'
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
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
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
      }
    } catch (error) {
      console.error('获取课程详情失败:', error)
    }
  }

  const fetchStudents = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get(`/courses/${courseId}/students`)
      if (response.code === 0) {
        setStudents(response.data.list)
      }
    } catch (error) {
      console.error('获取学生列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFreeze = async (student: Student) => {
    if (!window.confirm(student.isFrozen ? '确定要解冻该学生账号吗？' : '确定要冻结该学生账号吗？')) {
      return
    }

    setProcessingId(student.id)
    try {
      const response = await apiClient.put(`/courses/${courseId}/students/${student.id}/freeze`, {
        isFrozen: !student.isFrozen
      })
      if (response.code === 0) {
        setStudents(students.map(s => 
          s.id === student.id ? { ...s, isFrozen: !s.isFrozen } : s
        ))
        alert(response.message)
      }
    } catch (error: any) {
      alert(error.message || '操作失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleResetPassword = async (student: Student) => {
    if (!window.confirm(`确定要为 ${student.nickname} 生成一次性临时密码吗？\n\n临时密码只会写入受保护的本地交接文件。`)) {
      return
    }

    setProcessingId(student.id)
    try {
      const response = await apiClient.post(`/courses/${courseId}/students/${student.id}/reset-password`)
      if (response.code === 0) {
        alert(response.message || `已为 ${student.nickname} 生成一次性临时密码，请从受保护的本地交接文件中读取。`)
      }
    } catch (error: any) {
      alert(error.message || '重置密码失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleRemoveStudent = async (student: Student) => {
    if (!window.confirm(`确定要将 ${student.nickname} 从课程中移除吗？\n\n注意：此操作不会删除学生账号，只是将其从本课程中移除。`)) {
      return
    }

    setProcessingId(student.id)
    try {
      const response = await apiClient.delete(`/courses/${courseId}/students/${student.id}`)
      if (response.code === 0) {
        setStudents(students.filter(s => s.id !== student.id))
        alert('学生已从课程中移除')
      }
    } catch (error: any) {
      alert(error.message || '移除学生失败')
    } finally {
      setProcessingId(null)
    }
  }

  const filteredStudents = students.filter(
    (student) =>
      student.nickname?.toLowerCase().includes(keyword.toLowerCase()) ||
      student.username?.toLowerCase().includes(keyword.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/courses')}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">
            {course?.title || '课程学生管理'}
          </h1>
          <p className="text-sm text-gray-500">
            课程号: {course?.courseCode} | 共 {students.length} 名学生
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索学生姓名或账号..."
            className="input pl-10 w-full"
          />
        </div>
      </div>

      {/* Students Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {keyword ? '未找到匹配的学生' : '该课程暂无学生'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  学生信息
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  账号
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  加入时间
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.map((student) => (
                <tr key={student.id} className={student.isFrozen ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {student.avatarUrl ? (
                          <img
                            className="h-10 w-10 rounded-full"
                            src={student.avatarUrl}
                            alt={student.nickname}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-primary font-medium">
                              {student.nickname?.charAt(0) || '?'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className={`text-sm font-medium ${student.isFrozen ? 'text-gray-500' : 'text-gray-900'}`}>
                          {student.nickname}
                          {student.isFrozen && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              <Lock className="w-3 h-3 mr-1" />
                              已冻结
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{student.username}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      student.isFrozen
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {student.isFrozen ? '已冻结' : '正常'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(student.joinedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleToggleFreeze(student)}
                        disabled={processingId === student.id}
                        className={`p-2 rounded ${
                          student.isFrozen
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-orange-600 hover:bg-orange-50'
                        } disabled:opacity-50`}
                        title={student.isFrozen ? '解冻账号' : '冻结账号'}
                      >
                        {student.isFrozen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleResetPassword(student)}
                        disabled={processingId === student.id}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                        title="重置密码为 12345678"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveStudent(student)}
                        disabled={processingId === student.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                        title="从课程中移除"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-gray-800">{students.length}</div>
          <div className="text-sm text-gray-500">总学生数</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">
            {students.filter(s => !s.isFrozen).length}
          </div>
          <div className="text-sm text-gray-500">正常账号</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-red-600">
            {students.filter(s => s.isFrozen).length}
          </div>
          <div className="text-sm text-gray-500">已冻结</div>
        </div>
      </div>
    </div>
  )
}

export default CourseStudents
