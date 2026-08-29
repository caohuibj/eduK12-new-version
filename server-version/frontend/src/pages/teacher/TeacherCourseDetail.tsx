import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Users, ClipboardList, Calendar, Brain, Edit, UserCog, Settings, ClipboardCheck, RefreshCw } from 'lucide-react'
import apiClient from '../../api/client'
import type { Course, Assignment, Checkin } from '../../types'

// 心理量表类型
interface Scale {
  id: string
  code: string
  name: string
  description: string | null
  estimatedTime: number | null
  itemCount: number
}

// 问卷类型
interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  estimatedTime: number | null
  scaleCount: number
}

// 带统计的作业类型
interface AssignmentWithStats extends Assignment {
  submissionCount?: number
  totalStudents?: number
}

// 带统计的打卡类型
interface CheckinWithStats extends Checkin {
  submissionCount?: number
  totalStudents?: number
}

const TeacherCourseDetail: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'assignments' | 'checkins' | 'questionnaires'>('assignments')
  const [course, setCourse] = useState<Course | null>(null)
  const [assignments, setAssignments] = useState<AssignmentWithStats[]>([])
  const [checkins, setCheckins] = useState<CheckinWithStats[]>([])
  const [scales, setScales] = useState<Scale[]>([])
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (courseId) {
      fetchCourseDetail()
      fetchAssignments()
      fetchCheckins()
      fetchQuestionnaires()
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

  const fetchAssignments = async () => {
    try {
      const response = await apiClient.get(`/courses/${courseId}/assignments`)
      if (response.code === 0) {
        setAssignments(response.data.list)
      }
    } catch (error) {
      console.error('获取作业列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCheckins = async () => {
    try {
      const response = await apiClient.get(`/courses/${courseId}/checkins`)
      if (response.code === 0) {
        setCheckins(response.data.list)
      }
    } catch (error) {
      console.error('获取打卡列表失败:', error)
    }
  }

  const fetchScales = async () => {
    try {
      const response = await apiClient.get(`/scales/available?courseId=${courseId}`)
      if (response.code === 0) {
        setScales(response.data.list)
      }
    } catch (error) {
      console.error('获取心理测评列表失败:', error)
    }
  }

  const fetchQuestionnaires = async () => {
    try {
      const response = await apiClient.get(`/questionnaires/available?courseId=${courseId}`)
      if (response.code === 0) {
        setQuestionnaires(response.data.list)
      }
    } catch (error) {
      console.error('获取问卷列表失败:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const isOverdue = (deadline?: string) => {
    if (!deadline) return false
    return new Date(deadline) < new Date()
  }

  const rotateCourseCode = async () => {
    if (!courseId || !window.confirm('轮换后旧课程码会立即失效，确定继续吗？')) return
    try {
      const response = await apiClient.post(`/courses/${courseId}/rotate-code`)
      if (response.code === 0) {
        setCourse((current) => current ? { ...current, courseCode: response.data.courseCode } : current)
        alert('课程码已轮换，请把新课程码发给学生。')
      }
    } catch (error: any) {
      alert(error?.message || '课程码轮换失败')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">课程不存在或已删除</p>
        <button onClick={() => navigate('/courses')} className="btn-primary mt-4">
          返回课程列表
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/courses')}
        className="flex items-center text-gray-600 hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-1" />
        返回课程列表
      </button>

      {/* Course Header */}
      <div className="card">
        <div className="flex items-start space-x-4">
          {/* 课程封面 */}
          {course.coverUrl ? (
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
              <img
                src={course.coverUrl}
                alt={course.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-20 h-20 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-10 h-10 text-primary" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h1 className="text-2xl font-bold text-gray-800">{course.title}</h1>
                  {course.isLibrary && (
                    <span className="px-2 py-0.5 text-xs rounded bg-indigo-100 text-indigo-700">库课程</span>
                  )}
                </div>
                {course.description && (
                  <p className="text-gray-600 mb-3">{course.description}</p>
                )}
              </div>
              {/* 操作按钮 */}
              <div className="flex space-x-2">
                <button
                  onClick={() => navigate(`/courses/${courseId}/students`)}
                  className="btn-secondary flex items-center space-x-1"
                  title="管理学生"
                >
                  <UserCog className="w-4 h-4" />
                  <span>学生管理</span>
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{course.studentCount || 0} 名学员</span>
              </div>
              <div className="flex items-center gap-2">
                <span>课程码: {course.courseCode}</span>
                {!course.isLibrary && (
                  <button
                    type="button"
                    onClick={rotateCourseCode}
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                    title="轮换课程码"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>轮换</span>
                  </button>
                )}
              </div>
              <div>状态: {course.status === 'PUBLISHED' ? '已发布' : course.status === 'DRAFT' ? '草稿' : '已完结'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card bg-blue-50 border-blue-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">{assignments.length}</p>
              <p className="text-sm text-blue-600">作业</p>
            </div>
          </div>
        </div>
        <div className="card bg-green-50 border-green-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{checkins.length}</p>
              <p className="text-sm text-green-600">打卡</p>
            </div>
          </div>
        </div>
        {/* 心理测评 tab 暂时隐藏 */}
        <div className="card bg-orange-50 border-orange-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-700">{questionnaires.length}</p>
              <p className="text-sm text-orange-600">问卷</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'assignments'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>作业 ({assignments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('checkins')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'checkins'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>打卡 ({checkins.length})</span>
        </button>
        {/* 心理测评 tab 暂时隐藏 */}
        <button
          onClick={() => setActiveTab('questionnaires')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'questionnaires'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>问卷 ({questionnaires.length})</span>
        </button>
      </div>

      {/* Content */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">暂无作业</p>
              <button
                onClick={() => navigate('/assignments')}
                className="btn-primary"
              >
                去创建作业
              </button>
            </div>
          ) : (
            assignments.map((assignment) => (
              <div key={assignment.id} className="card hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/assignments?id=${assignment.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      {assignment.title}
                    </h3>
                    {assignment.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{assignment.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-sm">
                      <span className={`flex items-center space-x-1 ${
                        isOverdue(assignment.deadline) ? 'text-red-500' : 'text-gray-500'
                      }`}>
                        <span>截止: {assignment.deadline ? formatDate(assignment.deadline) : '无截止时间'}</span>
                      </span>
                      {assignment.submissionCount !== undefined && (
                        <span className="text-gray-500">
                          已提交: {assignment.submissionCount} / {assignment.totalStudents || course.studentCount || 0}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      assignment.status === 'PUBLISHED' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {assignment.status === 'PUBLISHED' ? '已发布' : '草稿'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'checkins' && (
        <div className="space-y-4">
          {checkins.length === 0 ? (
            <div className="card text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">暂无打卡</p>
              <button
                onClick={() => navigate('/checkins')}
                className="btn-primary"
              >
                去创建打卡
              </button>
            </div>
          ) : (
            checkins.map((checkin) => (
              <div key={checkin.id} className="card hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/checkins?id=${checkin.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      {checkin.title}
                    </h3>
                    {checkin.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{checkin.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>截止: {checkin.endTime ? formatDate(checkin.endTime) : '无截止时间'}</span>
                      {checkin.submissionCount !== undefined && (
                        <span>
                          已打卡: {checkin.submissionCount} / {checkin.totalStudents || course.studentCount || 0}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      checkin.status === 'PUBLISHED' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {checkin.status === 'PUBLISHED' ? '已发布' : '草稿'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 心理测评内容暂时隐藏 */}

      {activeTab === 'questionnaires' && (
        <div className="space-y-4">
          {questionnaires.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">暂无问卷</p>
              <button
                onClick={() => navigate('/questionnaires')}
                className="btn-primary"
              >
                去创建问卷
              </button>
            </div>
          ) : (
            questionnaires.map((questionnaire) => (
              <div key={questionnaire.id} className="card hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/questionnaires/${questionnaire.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      {questionnaire.name}
                    </h3>
                    {questionnaire.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{questionnaire.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{questionnaire.scaleCount} 个量表</span>
                      {questionnaire.estimatedTime && (
                        <span>预计 {questionnaire.estimatedTime} 分钟</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/questionnaires/${questionnaire.id}`)
                    }}
                    className="btn-secondary text-sm"
                  >
                    查看
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default TeacherCourseDetail
