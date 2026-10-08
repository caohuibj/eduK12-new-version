import React, { useState, useEffect } from 'react'
import { Search, Lock, Unlock, Key, Users, UserX, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import apiClient from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/product-ui/PageHeader'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'
import TemporaryPasswordHandoff, { type TemporaryPasswordHandoffValue } from '../components/staff-ui/TemporaryPasswordHandoff'
import { ProductPage } from '../components/product-ui/ProductPage'
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
  enrollmentStatus?: 'ACTIVE' | 'APPROVED' | 'PENDING'
}

const StudentManagement: React.FC = () => {
  const { user } = useAuth()
  const canManageGlobalAccount = user?.role === 'ADMIN' && user.platformRole === 'SYSTEM_ADMIN'
  const canResetCoursePassword = user?.role === 'TEACHER' || canManageGlobalAccount
  const { feedback, confirm, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const ask = (message: string) => confirm({ title: '确认操作', body: message, confirmLabel: '确认' })
  const [students, setStudents] = useState<Student[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [credential, setCredential] = useState<TemporaryPasswordHandoffValue | null>(null)
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
    } catch (fetchError) {
      console.error('获取课程列表失败:', fetchError)
    }
  }

  const fetchAllStudents = async () => {
    try {
      setLoading(true)
      setError(null)
      const coursesRes = await apiClient.get('/courses')
      if (coursesRes.code !== 0) {
        setError(coursesRes.message || '获取课程列表失败')
        return
      }

      const myCourses: Course[] = coursesRes.data.list
      setCourses(myCourses)

      if (myCourses.length === 0) {
        setStudents([])
        return
      }

      const courseIds = myCourses.map(course => course.id)
      try {
        const batchRes = await apiClient.post('/courses/batch-students', { courseIds })

        if (batchRes.code === 0 && batchRes.data.data) {
          const groupedStudents = batchRes.data.data
          const allStudents: Student[] = []

          for (const course of myCourses) {
            const courseStudents = groupedStudents[course.id] || []
            courseStudents.forEach((student: any) => {
              allStudents.push({
                ...student,
                courseId: course.id,
                courseTitle: course.title,
                courseCode: course.courseCode,
              })
            })
          }

          setStudents(allStudents)
        }
      } catch (batchError) {
        console.error('批量获取学生失败:', batchError)
        const allStudents: Student[] = []
        for (const course of myCourses) {
          try {
            const studentsRes = await apiClient.get(`/courses/${course.id}/students`)
            if (studentsRes.code === 0 && studentsRes.data.list) {
              const courseStudents = studentsRes.data.list.map((student: any) => ({
                ...student,
                courseId: course.id,
                courseTitle: course.title,
                courseCode: course.courseCode,
              }))
              allStudents.push(...courseStudents)
            }
          } catch (courseError) {
            console.error(`获取课程 ${course.id} 学生失败:`, courseError)
          }
        }
        setStudents(allStudents)
      }
    } catch (fetchError) {
      console.error('获取学生列表失败:', fetchError)
      setError((fetchError as { message?: string }).message || '获取学生列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFreeze = async (student: Student) => {
    if (!await ask(student.isFrozen ? '确定要解冻该学生账号吗？' : '确定要冻结该学生账号吗？')) {
      return
    }

    setProcessingId(student.id)
    try {
      const response = await apiClient.put(`/courses/${student.courseId}/students/${student.id}/freeze`, {
        isFrozen: !student.isFrozen,
      })
      if (response.code === 0) {
        await fetchAllStudents()
        showMessage(response.message)
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '操作失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleResetPassword = async (student: Student) => {
    if (!await ask(`确定为「${student.nickname}」重置登录密码吗？重置会使学员所有课程的旧登录会话失效，临时密码仅展示一次，并要求首次登录修改。`)) return

    setProcessingId(student.id)
    try {
      const response = await apiClient.post<{ temporaryPassword?: string; username?: string; handoffFile?: string }>(
        `/courses/${student.courseId}/students/${student.id}/reset-password`,
      )
      if (response.code !== 0) throw new Error(response.message || '重置失败')
      if (user?.role === 'TEACHER') {
        if (response.data?.temporaryPassword) {
          setCredential({
            studentName: student.nickname || student.username,
            username: response.data.username || student.username,
            temporaryPassword: response.data.temporaryPassword,
          })
        } else {
          showMessage('密码已重置，但未返回临时凭据。请联系平台管理员处理。')
        }
      } else {
        showMessage(response.data?.handoffFile
          ? `密码已重置，交接文件：${response.data.handoffFile}`
          : response.message || '密码已重置')
      }
    } catch (operationError) {
      showMessage(operationError instanceof Error ? operationError.message : '重置密码失败')
    } finally {
      setProcessingId(null)
    }
  }

  const handleRemoveStudent = async (student: Student) => {
    if (!await ask(`确定要将 ${student.nickname} 从课程「${student.courseTitle}」中移除吗？`)) {
      return
    }

    setProcessingId(student.id)
    try {
      const response = await apiClient.delete(`/courses/${student.courseId}/students/${student.id}`)
      if (response.code === 0) {
        await fetchAllStudents()
        showMessage('学生已从课程中移除')
      }
    } catch (operationError: any) {
      showMessage(operationError.message || '移除学生失败')
    } finally {
      setProcessingId(null)
    }
  }

  const toggleCourseExpand = (courseId: string) => {
    const nextExpanded = new Set(expandedCourses)
    if (nextExpanded.has(courseId)) {
      nextExpanded.delete(courseId)
    } else {
      nextExpanded.add(courseId)
    }
    setExpandedCourses(nextExpanded)
  }

  const filteredStudents = students.filter(student => {
    const matchesKeyword =
      student.nickname?.toLowerCase().includes(keyword.toLowerCase()) ||
      student.username?.toLowerCase().includes(keyword.toLowerCase())
    const matchesCourse = selectedCourseId === 'all' || student.courseId === selectedCourseId
    return matchesKeyword && matchesCourse
  })

  const studentsByCourse = courses.reduce((acc, course) => {
    acc[course.id] = students.filter(student => student.courseId === course.id)
    return acc
  }, {} as Record<string, Student[]>)

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('zh-CN')
  const getCourseStudentCount = (courseId: string) => students.filter(student => student.courseId === courseId).length

  const renderStudentActions = (student: Student, compact = false) => (
    <div className={`flex min-w-max items-center justify-end ${compact ? 'gap-1' : 'gap-2'}`}>
      {canManageGlobalAccount && <button
        type="button"
        onClick={() => handleToggleFreeze(student)}
        disabled={processingId === student.id}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center ${compact ? 'p-1' : 'p-2'} rounded ${
          student.isFrozen ? 'text-green-600 hover:bg-green-50' : 'text-orange-600 hover:bg-orange-50'
        } disabled:opacity-50`}
        aria-label={student.isFrozen ? `解冻 ${student.nickname} 的账号` : `冻结 ${student.nickname} 的账号`}
        title={student.isFrozen ? '解冻账号' : '冻结账号'}
      >
        {student.isFrozen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
      </button>}
      {canResetCoursePassword && !student.isFrozen && student.enrollmentStatus !== 'PENDING' && <button
        type="button"
        onClick={() => handleResetPassword(student)}
        disabled={processingId === student.id}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center ${compact ? 'p-1' : 'p-2'} text-blue-700 hover:bg-blue-50 rounded disabled:opacity-50`}
        aria-label={`重置 ${student.nickname} 的密码`}
        title="重置密码"
      >
        <Key className="w-4 h-4" />
      </button>}
      <button
        type="button"
        onClick={() => handleRemoveStudent(student)}
        disabled={processingId === student.id}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center ${compact ? 'p-1' : 'p-2'} text-red-700 hover:bg-red-50 rounded disabled:opacity-50`}
        aria-label={`将 ${student.nickname} 从课程中移除`}
        title="从课程中移除"
      >
        <UserX className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <TemporaryPasswordHandoff value={credential} onClose={() => setCredential(null)} />
      <PageHeader
        title="学生管理"
        description={`共 ${students.length} 名学生 · ${courses.length} 个课程`}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={() => void fetchAllStudents()}>
              重试
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <label className="block flex-1 max-w-md">
          <span className="mb-1 block text-sm font-medium text-gray-700">搜索学生</span>
          <span className="relative block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="姓名或账号"
              className="input w-full pl-10"
            />
          </span>
        </label>
        <label className="block md:min-w-56">
          <span className="mb-1 block text-sm font-medium text-gray-700">课程</span>
          <select
            value={selectedCourseId}
            onChange={(event) => setSelectedCourseId(event.target.value)}
            className="input w-full"
          >
            <option value="all">所有课程</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.title} ({getCourseStudentCount(course.id)}人)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">{courses.length}</div>
          <div className="text-sm text-gray-500">课程数</div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-action" />
          <span className="sr-only">正在加载学生列表</span>
        </div>
      ) : selectedCourseId !== 'all' ? (
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
                  <tr key={`${student.courseId}-${student.id}`} className={student.isFrozen ? 'bg-gray-50' : ''}>
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">{renderStudentActions(student)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredStudents.length === 0 && (
            <div className="py-12 text-center">
              <Users className="mx-auto mb-4 h-16 w-16 text-gray-300" aria-hidden="true" />
              <p className="text-gray-500">{keyword ? '未找到匹配的学生' : '该课程暂无学生'}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map(course => {
            const courseStudents = studentsByCourse[course.id] || []
            const isExpanded = expandedCourses.has(course.id)
            const panelId = `course-students-${course.id}`

            return (
              <div key={course.id} className="overflow-hidden rounded-lg bg-white shadow">
                <button
                  type="button"
                  onClick={() => toggleCourseExpand(course.id)}
                  className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <BookOpen className="h-5 w-5 flex-none text-action" aria-hidden="true" />
                    <div className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">{course.title}</span>
                      <span className="block text-sm text-gray-500">课程号: {course.courseCode}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{courseStudents.length} 名学生</span>
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" aria-hidden="true" /> : <ChevronDown className="h-5 w-5 text-gray-400" aria-hidden="true" />}
                  </div>
                </button>

                {isExpanded && courseStudents.length > 0 && (
                  <div id={panelId} className="border-t">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-2 text-left text-xs font-medium uppercase text-gray-500">学生</th>
                            <th className="px-6 py-2 text-left text-xs font-medium uppercase text-gray-500">账号</th>
                            <th className="px-6 py-2 text-left text-xs font-medium uppercase text-gray-500">状态</th>
                            <th className="px-6 py-2 text-right text-xs font-medium uppercase text-gray-500">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {courseStudents.slice(0, 5).map(student => (
                            <tr key={`${course.id}-${student.id}`} className={student.isFrozen ? 'bg-gray-50' : ''}>
                              <td className="px-6 py-2 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-action/10">
                                    <span className="text-sm font-medium text-action">{student.nickname?.charAt(0) || '?'}</span>
                                  </div>
                                  <span className="ml-2 text-sm text-gray-900">{student.nickname}</span>
                                  {student.isFrozen && <span className="ml-2 text-xs text-gray-500">(已冻结)</span>}
                                </div>
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">{student.username}</td>
                              <td className="px-6 py-2 whitespace-nowrap">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${student.isFrozen ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                  {student.isFrozen ? '已冻结' : '正常'}
                                </span>
                              </td>
                              <td className="px-6 py-2 whitespace-nowrap text-right">{renderStudentActions(student, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {courseStudents.length > 5 && (
                      <div className="border-t px-6 py-2 text-center">
                        <button type="button" onClick={() => setSelectedCourseId(course.id)} className="text-sm text-action hover:text-action-hover">
                          查看全部 {courseStudents.length} 名学生 →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isExpanded && courseStudents.length === 0 && (
                  <div id={panelId} className="border-t px-6 py-4 text-center text-gray-500">该课程暂无学生</div>
                )}
              </div>
            )
          })}

          {courses.length === 0 && (
            <div className="rounded-lg bg-white py-12 text-center shadow">
              <BookOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" aria-hidden="true" />
              <p className="text-gray-500">暂无课程，请先创建课程</p>
            </div>
          )}
        </div>
      )}
    </ProductPage>
  )
}

export default StudentManagement