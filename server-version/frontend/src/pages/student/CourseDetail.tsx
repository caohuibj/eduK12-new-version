import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Users, ClipboardList, Calendar, CheckCircle, Clock, ClipboardCheck } from 'lucide-react'
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
  completed: boolean
  completedAt: string | null
}

// 问卷类型
interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  estimatedTime: number | null
  scaleCount: number
  completed: boolean
  completedAt: string | null
}

interface CompositeAssessment {
  id: string
  name: string
  description: string | null
  instruction: string | null
  estimatedModules: number
  items: Array<{ type: string; label: string | null }>
  course: { id: string; title: string; courseCode: string } | null
  attempt: { id: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'; progress: number } | null
  latestCompletedAttempt: { id: string; status: 'COMPLETED'; progress: number } | null
  opensAt: string | null
  expiresAt: string | null
  maxAttempts: number
  attemptsUsed: number
  canContinue: boolean
  canStartNewAttempt: boolean
  availability: 'UPCOMING' | 'OPEN' | 'EXPIRED'
}

const CourseDetail: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'assignments' | 'checkins' | 'questionnaires' | 'composites'>('assignments')
  const [course, setCourse] = useState<Course | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [scales, setScales] = useState<Scale[]>([])
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [composites, setComposites] = useState<CompositeAssessment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (courseId) {
      fetchCourseDetail()
      fetchAssignments()
      fetchCheckins()
      fetchScales()
      fetchQuestionnaires()
      fetchComposites()
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

  const fetchComposites = async () => {
    try {
      const response = await apiClient.get<{ list: CompositeAssessment[] }>('/composite-assessments/available')
      if (response.code === 0) {
        setComposites((response.data?.list || []).filter((item) => item.course?.id === courseId))
      }
    } catch (error) {
      console.error('获取综合测评列表失败:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const isOverdue = (deadline?: string) => {
    if (!deadline) return false
    return new Date(deadline) < new Date()
  }

  // 判断是否为新任务（3天内创建）
  const isNew = (createdAt: string) => {
    return new Date(createdAt) > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  }

  // 计算未完成数量
  const uncompletedAssignments = assignments.filter(a => !a.submitted).length
  const uncompletedCheckins = checkins.filter(c => !c.submission).length
  const uncompletedQuestionnaires = questionnaires.filter(q => !q.completed).length
  const uncompletedComposites = composites.filter((item) => (
    item.canContinue || item.canStartNewAttempt
  )).length

  // 角标组件
  const Badge: React.FC<{ count: number }> = ({ count }) => {
    if (count === 0) return null
    const display = count > 99 ? '99+' : count
    return (
      <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
        {display}
      </span>
    )
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
        <button onClick={() => navigate('/student')} className="btn-primary mt-4">
          返回课程列表
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/student')}
        className="flex items-center text-gray-600 hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-1" />
        返回课程列表
      </button>

      {/* Course Header */}
      <div className="card">
        <div className="flex items-start space-x-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{course.title}</h1>
            {course.description && (
              <p className="text-gray-600 mb-4">{course.description}</p>
            )}
            <div className="flex items-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{course.studentCount || 0} 名学员</span>
              </div>
              <div>课程号: {course.courseCode}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'assignments'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>作业</span>
          <Badge count={uncompletedAssignments} />
        </button>
        <button
          onClick={() => setActiveTab('checkins')}
          className={`relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'checkins'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>打卡</span>
          <Badge count={uncompletedCheckins} />
        </button>
        <button
          onClick={() => setActiveTab('questionnaires')}
          className={`relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'questionnaires'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>问卷</span>
          <Badge count={uncompletedQuestionnaires} />
        </button>
        <button
          onClick={() => setActiveTab('composites')}
          className={`relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'composites'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>综合测评</span>
          <Badge count={uncompletedComposites} />
        </button>
      </div>

      {/* Content */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无作业</p>
            </div>
          ) : (
            assignments.map((assignment) => (
              <div key={assignment.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      {assignment.title}
                      {isNew(assignment.createdAt) && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-600 rounded">新</span>
                      )}
                    </h3>
                    {assignment.description && (
                      <p className="text-gray-600 text-sm mb-3">{assignment.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-sm">
                      <span className={`flex items-center space-x-1 ${
                        isOverdue(assignment.deadline) ? 'text-red-500' : 'text-gray-500'
                      }`}>
                        <Clock className="w-4 h-4" />
                        <span>截止: {formatDate(assignment.deadline)}</span>
                      </span>
                      {assignment.submitted && (
                        <span className="flex items-center space-x-1 text-green-500">
                          <CheckCircle className="w-4 h-4" />
                          <span>已提交</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/student/assignments/${assignment.id}`)}
                    className="btn-primary"
                  >
                    {assignment.submitted ? '查看' : '去提交'}
                  </button>
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
              <p className="text-gray-500">暂无打卡</p>
            </div>
          ) : (
            checkins.map((checkin) => (
              <div key={checkin.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      {checkin.title}
                      {isNew(checkin.createdAt) && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-600 rounded">新</span>
                      )}
                    </h3>
                    {checkin.description && (
                      <p className="text-gray-600 text-sm mb-3">{checkin.description}</p>
                    )}
                    <div className="text-sm text-gray-500">
                      截止: {formatDate(checkin.endTime)}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/student/checkins/${checkin.id}`)}
                    className="btn-primary"
                  >
                    {checkin.submitted ? '查看' : '去打卡'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'questionnaires' && (
        <div className="space-y-4">
          {questionnaires.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无问卷</p>
            </div>
          ) : (
            questionnaires.map((questionnaire) => (
              <div key={questionnaire.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      {questionnaire.name}
                      {questionnaire.createdAt && isNew(questionnaire.createdAt) && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-600 rounded">新</span>
                      )}
                    </h3>
                    {questionnaire.description && (
                      <p className="text-gray-600 text-sm mb-3">{questionnaire.description}</p>
                    )}
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{questionnaire.scaleCount} 个量表</span>
                      {questionnaire.estimatedTime && (
                        <span>预计 {questionnaire.estimatedTime} 分钟</span>
                      )}
                      {questionnaire.completed && (
                        <span className="flex items-center space-x-1 text-green-500">
                          <CheckCircle className="w-4 h-4" />
                          <span>已完成</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/student/questionnaires/${questionnaire.id}`)}
                    className="btn-primary"
                  >
                    {questionnaire.completed ? '查看报告' : '开始测评'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'composites' && (
        <div className="space-y-4">
          {composites.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无综合测评</p>
            </div>
          ) : (
            composites.map((composite) => {
              const attempt = composite.attempt
              const canContinue = composite.canContinue || attempt?.status === 'IN_PROGRESS'
              const canStartNewAttempt = composite.canStartNewAttempt
              const latestCompletedAttempt = composite.latestCompletedAttempt
                || (attempt?.status === 'COMPLETED' ? attempt : null)
              const canViewReport = Boolean(latestCompletedAttempt)
              const reportTarget = latestCompletedAttempt
                ? `/student/composite/attempts/${latestCompletedAttempt.id}/report`
                : ''
              const target = canContinue
                ? `/student/composite/attempts/${attempt?.id}`
                : canStartNewAttempt
                  ? `/student/composite/${composite.id}`
                  : reportTarget
              const showReportAction = canViewReport && (canContinue || canStartNewAttempt)
              const availabilityLabel = composite.availability === 'UPCOMING'
                ? '尚未开始'
                : composite.availability === 'EXPIRED'
                  ? '已过期'
                  : !canStartNewAttempt && composite.attemptsUsed >= composite.maxAttempts
                    ? '已达到最大次数'
                    : '可以开始'
              const actionLabel = canContinue
                ? '继续测评'
                : canStartNewAttempt
                  ? attempt?.status === 'COMPLETED' ? '再次测评' : '开始测评'
                  : canViewReport
                    ? '查看报告'
                  : availabilityLabel
              return (
                <div key={composite.id} className="card hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">{composite.name}</h3>
                      {composite.description && <p className="text-gray-600 text-sm mb-3">{composite.description}</p>}
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>{composite.estimatedModules} 个模块</span>
                        {attempt && <span>{attempt.status === 'COMPLETED' ? '已完成' : `已完成 ${attempt.progress}%`}</span>}
                        <span className={composite.availability === 'OPEN' ? 'text-green-600' : 'text-amber-600'}>{availabilityLabel}</span>
                        {composite.maxAttempts > 1 && <span>已使用 {composite.attemptsUsed} / {composite.maxAttempts} 次</span>}
                      </div>
                      {(composite.opensAt || composite.expiresAt) && (
                        <p className="text-xs text-gray-400 mt-2">
                          {composite.opensAt && `开始：${formatDate(composite.opensAt)}`}
                          {composite.opensAt && composite.expiresAt && ' · '}
                          {composite.expiresAt && `截止：${formatDate(composite.expiresAt)}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { if (target) navigate(target) }} disabled={!target} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                        {actionLabel}
                      </button>
                      {showReportAction && (
                        <button onClick={() => { if (reportTarget) navigate(reportTarget) }} className="btn-secondary">
                          查看上次报告
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default CourseDetail
