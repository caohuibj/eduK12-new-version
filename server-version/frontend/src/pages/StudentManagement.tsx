import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Lock, Unlock, Key, Trash2, Users, UserX, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import apiClient from '../api/client'
import type { Course } from '../types'

interface Student {
  id: string
  username: string
  nickname: string
  avatarUrl?: string
  isFrozen: boolean
  joinedAt: string
  courseId: string
  courseTitle: string
  courseCode: string
}

const StudentManagement: React.FC = () => {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchCourses()
    fetchAllStudents()
  }, [])

  const fetchCourses = async () => {
    try {
      const response = await apiClient.get('/courses')
      if (response.code === 0) {
        setCourses(response.data.list)
      }
    } catch (error) {
      console.error('获取课程列表失败:', error)
    }
  }

  const fetchAllStudents = async () => {
    try {
      setLoading(true)
      // 获取教师的所有课程
      const coursesRes = await apiClient.get('/courses')
      if (coursesRes.code !== 0) {
        setLoading(false)
        return
      }

      const myCourses: Course[] = coursesRes.data.list
      setCourses(myCourses)

      if (myCourses.length === 0) {
        setStudents([])
        setLoading(false)
        return
      }

      // 使用批量接口一次性获取所有课程的学生（优化 N+1 查询）
      const courseIds = myCourses.map(c => c.id)
      try {
        const batchRes = await apiClient.post('/courses/batch-students', {
          courseIds
        })
        
        if (batchRes.code === 0 && batchRes.data.data) {
          const groupedStudents = batchRes.data.data
          const allStudents: Student[] = []
          
          for (const course of myCourses) {
            const courseStudents = groupedStudents[course.id] || []
            courseStudents.forEach((s: any) => {
              allStudents.push({
                ...s,
                courseId: course.id,
                courseTitle: course.title,
                courseCode: course.courseCode,
              })
            })
          }
          
          setStudents(allStudents)
        }
      } catch (err) {
        console.error('批量获取学生失败:', err)
        // 降级：使用原来的逐个获取方式
        const allStudents: Student[] = []
        for (const course of myCourses) {
          try {
            const studentsRes = await apiClient.get(`/courses/${course.id}/students`)
            if (studentsRes.code === 0 && studentsRes.data.list) {
              const courseStudents = studentsRes.data.list.map((s: any) => ({
                ...s,
                courseId: course.id,
                courseTitle: course.title,
                courseCode: course.courseCode,
              }))
              allStudents.push(...courseStudents)
            }
          } catch (err) {
            console.error(`获取课程 ${course.id} 学生失败:`, err)
          }
        }
        setStudents(allStudents)
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
      const response = await apiClient.put(`/courses/${student.courseId}/students/${student.id}/freeze`, {
        isFrozen: !student.isFrozen
      })
      if (response.code === 0) {
        // 操作成功后重新获取数据，确保状态同步
        await fetchAllStudents()
        alert(response.message)
      }
    } catch (error: any) {
      alert(error.message || '操作失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleResetPassword = async (student: Student) => {
    if (!window.confirm(`确定要重置 ${student.nickname} 的密码吗？`)) {
      return
    }

    setProcessingId(student.id)
    try {
      const response = await apiClient.post(`/courses/${student.courseId}/students/${student.id}/reset-password`)
      if (response.code === 0) {
        const handoffFile = response.data?.handoffFile || '受保护的交接文件'
        alert(`${response.message || '密码已重置'}\n文件：${handoffFile}\n请从本机受保护的交接目录读取临时密码，并让学生首次登录后立即修改。`)
      }
    } catch (error: any) {
      alert(error.message || '重置密码失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleRemoveStudent = async (student: Student) => {
    if (!window.confirm(`确定要将 ${student.nickname} 从课程「${student.courseTitle}」中移除吗？`)) {
      return
    }

    setProcessingId(student.id)
    try {
      const response = await apiClient.delete(`/courses/${student.courseId}/students/${student.id}`)
      if (response.code === 0) {
        // 操作成功后重新获取数据，确保状态同步
        await fetchAllStudents()
        alert('学生已从课程中移除')
      }
    } catch (error: any) {
      alert(error.message || '移除学生失败')
    } finally {
      setProcessingId(null)
    }
  }

  const toggleCourseExpand = (courseId: string) => {
    const newExpanded = new Set(expandedCourses)
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId)
    } else {
      newExpanded.add(courseId)
    }
    setExpandedCourses(newExpanded)
  }

  const filteredStudents = students.filter(
    (student) => {
      const matchesKeyword = 
        student.nickname?.toLowerCase().includes(keyword.toLowerCase()) ||
        student.username?.toLowerCase().includes(keyword.toLowerCase())
      const matchesCourse = selectedCourseId === 'all' || student.courseId === selectedCourseId
      return matchesKeyword && matchesCourse
    }
  )

  // 按课程分组学生
  const studentsByCourse = courses.reduce((acc, course) => {
    acc[course.id] = students.filter(s => s.courseId === course.id)
    return acc
  }, {} as Record<string, Student[]>)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const getCourseStudentCount = (courseId: string) => {
    return students.filter(s => s.courseId === courseId).length
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">学生管理</h1>
          <p className="text-sm text-gray-500">
            共 {students.length} 名学生 | {courses.length} 个课程
          </p>
        </div>
      </div>

      {/* Search & Filter */}
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
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="input"
        >
          <option value="all">所有课程</option>
          {courses.map(course => (
            <option key={course.id} value={course.id}>
              {course.title} ({getCourseStudentCount(course.id)}人)
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
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
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">{courses.length}</div>
          <div className="text-sm text-gray-500">课程数</div>
        </div>
      </div>

      {/* Course List with Students */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : selectedCourseId !== 'all' ? (
        // Single course view
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
                <tr key={`${student.courseId}-${student.id}`} className={student.isFrozen ? 'bg-gray-50' : ''}>
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
          {filteredStudents.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {keyword ? '未找到匹配的学生' : '该课程暂无学生'}
              </p>
            </div>
          )}
        </div>
      ) : (
        // All courses view - grouped by course
        <div className="space-y-4">
          {courses.map(course => {
            const courseStudents = studentsByCourse[course.id] || []
            const isExpanded = expandedCourses.has(course.id)
            
            return (
              <div key={course.id} className="bg-white rounded-lg shadow overflow-hidden">
                <button
                  onClick={() => toggleCourseExpand(course.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-3">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <div className="text-left">
                      <span className="font-medium text-gray-900">{course.title}</span>
                      <span className="ml-2 text-sm text-gray-500">课程号: {course.courseCode}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500">{courseStudents.length} 名学生</span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
                
                {isExpanded && courseStudents.length > 0 && (
                  <div className="border-t">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">学生</th>
                          <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">账号</th>
                          <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                          <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {courseStudents.slice(0, 5).map((student) => (
                          <tr key={`${course.id}-${student.id}`} className={student.isFrozen ? 'bg-gray-50' : ''}>
                            <td className="px-6 py-2 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-primary text-sm font-medium">
                                    {student.nickname?.charAt(0) || '?'}
                                  </span>
                                </div>
                                <span className="ml-2 text-sm text-gray-900">{student.nickname}</span>
                                {student.isFrozen && (
                                  <span className="ml-2 text-xs text-gray-500">(已冻结)</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">{student.username}</td>
                            <td className="px-6 py-2 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                                student.isFrozen ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {student.isFrozen ? '已冻结' : '正常'}
                              </span>
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  onClick={() => handleToggleFreeze(student)}
                                  disabled={processingId === student.id}
                                  className={`p-1 rounded ${student.isFrozen ? 'text-green-600 hover:bg-green-50' : 'text-orange-600 hover:bg-orange-50'}`}
                                  title={student.isFrozen ? '解冻' : '冻结'}
                                >
                                  {student.isFrozen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleResetPassword(student)}
                                  disabled={processingId === student.id}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="重置密码"
                                >
                                  <Key className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleRemoveStudent(student)}
                                  disabled={processingId === student.id}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                  title="移除"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {courseStudents.length > 5 && (
                      <div className="px-6 py-2 text-center border-t">
                        <button
                          onClick={() => setSelectedCourseId(course.id)}
                          className="text-sm text-primary hover:text-primary-hover"
                        >
                          查看全部 {courseStudents.length} 名学生 →
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                {isExpanded && courseStudents.length === 0 && (
                  <div className="px-6 py-4 text-center text-gray-500 border-t">
                    该课程暂无学生
                  </div>
                )}
              </div>
            )
          })}
          
          {courses.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无课程，请先创建课程</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default StudentManagement
