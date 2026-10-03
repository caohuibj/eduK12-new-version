import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Users, ClipboardList, Calendar, CheckCircle, Clock, ClipboardCheck } from 'lucide-react'
import apiClient from '../../api/client'
import type { Course, Assignment, Checkin } from '../../types'
import { ProductPage } from '../../components/product-ui'

// 问卷类型
interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  estimatedTime: number | null
  scaleCount: number
  completed: boolean
  inProgress?: boolean
  completedAt: string | null
  assessmentId: string | null
  createdAt?: string
}

type CourseSection = 'assignments' | 'checkins' | 'questionnaires' | 'composites'

const initialSectionLoading: Record<CourseSection, boolean> = {
  assignments: true,
  checkins: true,
  questionnaires: true,
  composites: true,
}

const getErrorMessage = (reason: unknown, fallback: string) => (
  reason instanceof Error ? reason.message : fallback
)

const hasCheckinSubmission = (checkin: Checkin) => Boolean(checkin.submission ?? checkin.submitted)

const questionnaireDestination = (questionnaire: Questionnaire) => (
  questionnaire.inProgress
    ? `/student/questionnaires/${questionnaire.id}`
    : questionnaire.completed && questionnaire.assessmentId
      ? `/student/questionnaires/result/${questionnaire.assessmentId}`
      : `/student/questionnaires/${questionnaire.id}`
)

interface CompositeAssessment {
  id: string
  productKind?: string
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
  const [activeTab, setActiveTab] = useState<CourseSection>('assignments')
  const [course, setCourse] = useState<Course | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [composites, setComposites] = useState<CompositeAssessment[]>([])
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [sectionLoading, setSectionLoading] = useState<Record<CourseSection, boolean>>(initialSectionLoading)
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<CourseSection, string>>>({})

  useEffect(() => {
    if (!courseId) {
      setCourseLoading(false)
      setCourseError('课程链接无效')
      return
    }

    void fetchCourseDetail()
    void fetchAssignments()
    void fetchCheckins()
    void fetchQuestionnaires()
    void fetchComposites()
  }, [courseId])

  const beginSectionLoad = (section: CourseSection) => {
    setSectionLoading((current) => ({ ...current, [section]: true }))
    setSectionErrors((current) => {
      const next = { ...current }
      delete next[section]
      return next
    })
  }

  const finishSectionLoad = (section: CourseSection) => {
    setSectionLoading((current) => ({ ...current, [section]: false }))
  }

  const fetchCourseDetail = async () => {
    setCourseLoading(true)
    setCourseError(null)
    try {
      const response = await apiClient.get(`/courses/${courseId}`)
      if (response.code !== 0 || !response.data) {
        throw new Error(response.message || '获取课程详情失败')
      }
      setCourse(response.data)
    } catch (reason) {
      console.error('获取课程详情失败:', reason)
      setCourse(null)
      setCourseError(getErrorMessage(reason, '获取课程详情失败'))
    } finally {
      setCourseLoading(false)
    }
  }

  const fetchAssignments = async () => {
    beginSectionLoad('assignments')
    try {
      const response = await apiClient.get(`/courses/${courseId}/assignments`)
      if (response.code !== 0) throw new Error(response.message || '获取作业列表失败')
      setAssignments(response.data?.list || [])
    } catch (reason) {
      console.error('获取作业列表失败:', reason)
      setSectionErrors((current) => ({ ...current, assignments: getErrorMessage(reason, '获取作业列表失败') }))
    } finally {
      finishSectionLoad('assignments')
    }
  }

  const fetchCheckins = async () => {
    beginSectionLoad('checkins')
    try {
      const response = await apiClient.get(`/courses/${courseId}/checkins`)
      if (response.code !== 0) throw new Error(response.message || '获取打卡列表失败')
      setCheckins(response.data?.list || [])
    } catch (reason) {
      console.error('获取打卡列表失败:', reason)
      setSectionErrors((current) => ({ ...current, checkins: getErrorMessage(reason, '获取打卡列表失败') }))
    } finally {
      finishSectionLoad('checkins')
    }
  }

  const fetchQuestionnaires = async () => {
    beginSectionLoad('questionnaires')
    try {
      const response = await apiClient.get(`/questionnaires/available?courseId=${courseId}`)
      if (response.code !== 0) throw new Error(response.message || '获取问卷列表失败')
      setQuestionnaires(response.data?.list || [])
    } catch (reason) {
      console.error('获取问卷列表失败:', reason)
      setSectionErrors((current) => ({ ...current, questionnaires: getErrorMessage(reason, '获取问卷列表失败') }))
    } finally {
      finishSectionLoad('questionnaires')
    }
  }

  const fetchComposites = async () => {
    beginSectionLoad('composites')
    try {
      const response = await apiClient.get<{ list: CompositeAssessment[] }>('/composite-assessments/available')
      if (response.code !== 0) throw new Error(response.message || '获取综合测评列表失败')
      const available = response.data?.list || []
      const deliveredIds = new Set<string>()
      // Modern course questionnaires use a many-to-many delivery relation, so
      // their legacy `course` field is null. The student task feed projects only
      // the caller's approved memberships; never infer access from visibility.
      if (available.some((item) => item.productKind === 'QUESTIONNAIRE' && !item.course)) {
        const pageSize = 100
        let page = 1
        let total = 0
        do {
          const tasks = await apiClient.get<{
            list: Array<{ id: string; kind: string; courses: Array<{ id: string }> }>
            total: number
          }>(`/courses/my/tasks?page=${page}&pageSize=${pageSize}`)
          if (tasks.code !== 0) throw new Error(tasks.message || '获取课程测评任务失败')
          for (const task of tasks.data?.list || []) {
            if (task.kind === 'COMPOSITE' && task.courses.some((linked) => linked.id === courseId)) deliveredIds.add(task.id)
          }
          total = tasks.data?.total || 0
          page += 1
        } while ((page - 1) * pageSize < total)
      }
      setComposites(available.filter((item) => item.course?.id === courseId || deliveredIds.has(item.id)))
    } catch (reason) {
      console.error('获取综合测评列表失败:', reason)
      setSectionErrors((current) => ({ ...current, composites: getErrorMessage(reason, '获取综合测评列表失败') }))
    } finally {
      finishSectionLoad('composites')
    }
  }

  const formatDate = (dateString?: string | null) => {
    return dateString ? new Date(dateString).toLocaleDateString('zh-CN') : '—'
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
  const uncompletedCheckins = checkins.filter((checkin) => !hasCheckinSubmission(checkin)).length
  const uncompletedQuestionnaires = questionnaires.filter(q => !q.completed).length
  const uncompletedComposites = composites.filter((item) => {
    const hasActiveAttempt = item.canContinue || item.attempt?.status === 'IN_PROGRESS'
    const hasCompletedAttempt = Boolean(item.latestCompletedAttempt || item.attempt?.status === 'COMPLETED')
    return hasActiveAttempt || (!hasCompletedAttempt && item.canStartNewAttempt)
  }).length

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

  const SectionStatus: React.FC<{
    section: CourseSection
    label: string
    onRetry: () => void
  }> = ({ section, label, onRetry }) => {
    if (sectionLoading[section]) {
      return (
        <div className="card text-center py-10" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-action mx-auto mb-3" />
          <p className="text-gray-500">正在加载{label}...</p>
        </div>
      )
    }

    const sectionError = sectionErrors[section]
    if (sectionError) {
      return (
        <div className="card text-center py-10" role="alert">
          <p className="text-red-600 mb-2">{label}加载失败</p>
          <p className="text-sm text-gray-500 mb-4">{sectionError}</p>
          <button onClick={onRetry} className="btn-secondary">重试</button>
        </div>
      )
    }

    return null
  }

  if (courseLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-action mx-auto mb-3"></div>
          <p className="text-gray-500">正在加载课程...</p>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">{courseError || '课程不存在、已删除或当前账户无法访问'}</p>
        <button onClick={() => navigate('/student')} className="btn-primary mt-4">
          返回课程列表
        </button>
      </div>
    )
  }

  return (
    <ProductPage width="report" className="hui-student-page hui-course-detail space-y-5">
      {/* Back Button */}
      <button
        onClick={() => navigate('/student')}
        className="hui-course-back flex items-center text-gray-600 hover:text-action transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-1" />
        返回课程列表
      </button>

      {/* Course Header */}
      <div className="hui-course-hero card">
        <div className="hui-course-hero__content">
          <div className="hui-course-hero__icon">
            <BookOpen className="w-8 h-8 text-action" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{course.title}</h1>
            {course.description && (
              <p className="text-gray-600 mb-4">{course.description}</p>
            )}
            <div className="hui-course-meta">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{course.studentCount || 0} 名学员</span>
              </div>
              {course.courseCode && <div>课程号: {course.courseCode}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="hui-course-tabs">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`hui-course-tab relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'assignments'
              ? 'hui-course-tab--active bg-white text-action shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>作业</span>
          <Badge count={uncompletedAssignments} />
        </button>
        <button
          onClick={() => setActiveTab('checkins')}
          className={`hui-course-tab relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'checkins'
              ? 'hui-course-tab--active bg-white text-action shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>打卡</span>
          <Badge count={uncompletedCheckins} />
        </button>
        <button
          onClick={() => setActiveTab('questionnaires')}
          className={`hui-course-tab relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'questionnaires'
              ? 'hui-course-tab--active bg-white text-action shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>问卷</span>
          <Badge count={uncompletedQuestionnaires} />
        </button>
        <button
          onClick={() => setActiveTab('composites')}
          className={`hui-course-tab relative flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'composites'
              ? 'hui-course-tab--active bg-white text-action shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>综合测评</span>
          <Badge count={uncompletedComposites} />
        </button>
      </div>

      {/* Content */}
      {activeTab === 'assignments' && (sectionLoading.assignments || sectionErrors.assignments) && (
        <SectionStatus section="assignments" label="作业" onRetry={() => { void fetchAssignments() }} />
      )}
      {activeTab === 'assignments' && !sectionLoading.assignments && !sectionErrors.assignments && (
        <div className="hui-course-list space-y-4">
          {assignments.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无作业</p>
            </div>
          ) : (
            assignments.map((assignment) => (
              <div key={assignment.id} className="hui-course-task-card card hover:shadow-md transition-shadow">
                <div className="hui-course-task-row flex items-start justify-between">
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

      {activeTab === 'checkins' && (sectionLoading.checkins || sectionErrors.checkins) && (
        <SectionStatus section="checkins" label="打卡" onRetry={() => { void fetchCheckins() }} />
      )}
      {activeTab === 'checkins' && !sectionLoading.checkins && !sectionErrors.checkins && (
        <div className="hui-course-list space-y-4">
          {checkins.length === 0 ? (
            <div className="card text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无打卡</p>
            </div>
          ) : (
            checkins.map((checkin) => (
              <div key={checkin.id} className="hui-course-task-card card hover:shadow-md transition-shadow">
                <div className="hui-course-task-row flex items-start justify-between">
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
                    {hasCheckinSubmission(checkin) ? '查看' : '去打卡'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'questionnaires' && (sectionLoading.questionnaires || sectionErrors.questionnaires) && (
        <SectionStatus section="questionnaires" label="问卷" onRetry={() => { void fetchQuestionnaires() }} />
      )}
      {activeTab === 'questionnaires' && !sectionLoading.questionnaires && !sectionErrors.questionnaires && (
        <div className="hui-course-list space-y-4">
          {questionnaires.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无问卷</p>
            </div>
          ) : (
            questionnaires.map((questionnaire) => (
              <div key={questionnaire.id} className="hui-course-task-card card hover:shadow-md transition-shadow">
                <div className="hui-course-task-row flex items-start justify-between">
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
                    onClick={() => navigate(questionnaireDestination(questionnaire))}
                    className="btn-primary"
                  >
                    {questionnaire.inProgress ? '继续测评' : questionnaire.completed ? '查看报告' : '开始测评'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'composites' && (sectionLoading.composites || sectionErrors.composites) && (
        <SectionStatus section="composites" label="综合测评" onRetry={() => { void fetchComposites() }} />
      )}
      {activeTab === 'composites' && !sectionLoading.composites && !sectionErrors.composites && (
        <div className="hui-course-list space-y-4">
          {composites.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无综合测评</p>
            </div>
          ) : (
            composites.map((composite) => {
              const attempt = composite.attempt
              const hasActiveAttempt = composite.canContinue || attempt?.status === 'IN_PROGRESS'
              const canContinue = hasActiveAttempt
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
              const availabilityLabel = hasActiveAttempt
                ? '进行中'
                : composite.availability === 'UPCOMING'
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
                <div key={composite.id} className="hui-course-task-card card hover:shadow-md transition-shadow">
                  <div className="hui-course-task-row flex items-start justify-between">
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
                    <div className="hui-course-task-actions flex items-center gap-2">
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
    </ProductPage>
  )
}

export default CourseDetail
