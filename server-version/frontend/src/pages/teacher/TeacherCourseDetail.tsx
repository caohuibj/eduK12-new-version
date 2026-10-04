import React, { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { BookOpen, ClipboardList, Calendar, ClipboardCheck, RefreshCw } from 'lucide-react'
import apiClient from '../../api/client'
import type { Course, Assignment, Checkin } from '../../types'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

// 问卷类型
interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  estimatedTime: number | null
  kind: string
  unitCount: number
  unitLabel: string
  manageHref: string | null
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
  const { feedback, confirm, success, error: showError } = useStaffFeedback()
  const [activeTab, setActiveTab] = useState<'assignments' | 'checkins' | 'questionnaires'>('assignments')
  const [course, setCourse] = useState<Course | null>(null)
  const [assignments, setAssignments] = useState<AssignmentWithStats[]>([])
  const [checkins, setCheckins] = useState<CheckinWithStats[]>([])
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)
  const [questionnaireError, setQuestionnaireError] = useState(false)

  useEffect(() => {
    if (!courseId) return

    let active = true
    setLoading(true)

    void Promise.all([
      fetchCourseDetail(),
      fetchAssignments(),
      fetchCheckins(),
      fetchQuestionnaires(),
    ]).finally(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
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

  const fetchQuestionnaires = async () => {
    try {
      const response = await apiClient.get(`/courses/${courseId}/questionnaires`)
      if (response.code === 0) {
        setQuestionnaires(response.data.list)
        setQuestionnaireError(false)
      } else {
        setQuestionnaires([])
        setQuestionnaireError(true)
      }
    } catch (error) {
      setQuestionnaires([])
      setQuestionnaireError(true)
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
    if (!courseId || !(await confirm({ title: '轮换课程码？', body: '旧课程码会立即失效，请在轮换后把新课程码发给学生。', confirmLabel: '轮换课程码' }))) return
    try {
      const response = await apiClient.post(`/courses/${courseId}/rotate-code`)
      if (response.code === 0) {
        setCourse(current => current ? { ...current, courseCode: response.data.courseCode } : current)
        success('课程码已轮换', `新课程码：${response.data.courseCode}`)
      }
    } catch (error: any) {
      showError('课程码轮换失败', error?.message || '请稍后重试')
    }
  }

  if (loading) return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载课程">正在读取课程、作业和打卡概况。</ProductStatus></ProductPage>
  if (!course) return <ProductPage width="management"><ProductStatus kind="error" title="课程不可用" actions={<Link to="/courses">返回课程列表</Link>}>课程不存在、已删除，或当前账户无法访问。</ProductStatus></ProductPage>

  return (
    <ProductPage width="management" className="space-y-6 staff-course-detail">
      <PageHeader
        title={course.title}
        description={course.description || '课程详情、学生与教学任务'}
        actions={<Link className="staff-primary-link" to={`/courses/${courseId}/students`}>管理学生</Link>}
      />
      {feedback}

      <section className="staff-detail-header" aria-label="课程概况">
        <div className="staff-detail-header__top">
          <div className="staff-course-detail-summary">
            {course.coverUrl
              ? <img src={course.coverUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
              : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100"><BookOpen className="h-9 w-9 text-slate-500" aria-hidden="true" /></div>}
            <div className="staff-course-detail-summary__copy">
              <strong>{course.isLibrary ? '库课程' : '授课课程'}</strong>
              <div className="staff-detail-meta">
                <span>{course.studentCount || 0} 名学生</span>
                <span>状态：{course.status === 'PUBLISHED' ? '已发布' : course.status === 'DRAFT' ? '草稿' : '已完结'}</span>
              </div>
            </div>
          </div>
          {!course.isLibrary && (
            <ProductButton onClick={() => void rotateCourseCode()}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              轮换课程码
            </ProductButton>
          )}
        </div>
        <div className="staff-detail-meta">
          <span>课程码：<strong>{course.courseCode}</strong></span>
          <Link to="/courses">返回课程列表</Link>
        </div>
      </section>

      <dl className="staff-stat-grid" aria-label="课程内容概况">
        <div className="staff-stat">
          <dt>作业</dt>
          <dd>{assignments.length}</dd>
        </div>
        <div className="staff-stat">
          <dt>打卡</dt>
          <dd>{checkins.length}</dd>
        </div>
        <div className="staff-stat">
          <dt>问卷</dt>
          <dd>{questionnaireError ? '暂不可用' : questionnaires.length}</dd>
        </div>
      </dl>

      <div className="staff-toolbar staff-course-detail-tabs">
        <div className="staff-segmented" role="group" aria-label="课程内容">
          <button type="button" aria-pressed={activeTab === 'assignments'} onClick={() => setActiveTab('assignments')}>
            <ClipboardList className="w-4 h-4" aria-hidden="true" />
            作业 ({assignments.length})
          </button>
          <button type="button" aria-pressed={activeTab === 'checkins'} onClick={() => setActiveTab('checkins')}>
            <Calendar className="w-4 h-4" aria-hidden="true" />
            打卡 ({checkins.length})
          </button>
          <button type="button" aria-pressed={activeTab === 'questionnaires'} onClick={() => setActiveTab('questionnaires')}>
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
            问卷 ({questionnaireError ? '暂不可用' : questionnaires.length})
          </button>
        </div>
      </div>

      {activeTab === 'assignments' && (
        <section aria-label="课程作业">
          {assignments.length === 0 ? (
            <ProductStatus
              kind="info"
              title="暂无作业"
              actions={<ProductButton variant="primary" onClick={() => navigate(`/assignments?create=true&courseId=${encodeURIComponent(courseId || '')}`)}>去创建作业</ProductButton>}
            >
              当前课程还没有作业。
            </ProductStatus>
          ) : (
            <div className="staff-course-detail-list">
              {assignments.map((assignment) => (
                <button
                  type="button"
                  key={assignment.id}
                  className="staff-panel staff-course-detail-item"
                  onClick={() => navigate(`/assignments?id=${assignment.id}`)}
                >
                  <span className="staff-course-detail-item__main">
                    <span>
                      <strong className="staff-course-detail-item__title">{assignment.title}</strong>
                      {assignment.description && <span className="staff-course-detail-item__description">{assignment.description}</span>}
                    </span>
                    <span className={`staff-badge ${assignment.status === 'PUBLISHED' ? 'staff-badge--success' : 'staff-badge--warning'}`}>
                      {assignment.status === 'PUBLISHED' ? '已发布' : '草稿'}
                    </span>
                  </span>
                  <span className="staff-detail-meta">
                    <span className={isOverdue(assignment.deadline) ? 'staff-course-detail-item__overdue' : undefined}>
                      截止：{assignment.deadline ? formatDate(assignment.deadline) : '无截止时间'}
                    </span>
                    {assignment.submissionCount !== undefined && (
                      <span>已提交：{assignment.submissionCount} / {assignment.totalStudents || course.studentCount || 0}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'checkins' && (
        <section aria-label="课程打卡">
          {checkins.length === 0 ? (
            <ProductStatus
              kind="info"
              title="暂无打卡"
              actions={<ProductButton variant="primary" onClick={() => navigate('/checkins')}>去创建打卡</ProductButton>}
            >
              当前课程还没有打卡任务。
            </ProductStatus>
          ) : (
            <div className="staff-course-detail-list">
              {checkins.map((checkin) => (
                <button
                  type="button"
                  key={checkin.id}
                  className="staff-panel staff-course-detail-item"
                  onClick={() => navigate(`/checkins?id=${checkin.id}`)}
                >
                  <span className="staff-course-detail-item__main">
                    <span>
                      <strong className="staff-course-detail-item__title">{checkin.title}</strong>
                      {checkin.description && <span className="staff-course-detail-item__description">{checkin.description}</span>}
                    </span>
                    <span className={`staff-badge ${checkin.status === 'PUBLISHED' ? 'staff-badge--success' : 'staff-badge--warning'}`}>
                      {checkin.status === 'PUBLISHED' ? '已发布' : '草稿'}
                    </span>
                  </span>
                  <span className="staff-detail-meta">
                    <span>截止：{checkin.endTime ? formatDate(checkin.endTime) : '无截止时间'}</span>
                    {checkin.submissionCount !== undefined && (
                      <span>已打卡：{checkin.submissionCount} / {checkin.totalStudents || course.studentCount || 0}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'questionnaires' && (
        <section aria-label="课程问卷">
          {questionnaireError ? <ProductStatus kind="error" title="课程问卷加载失败" actions={<ProductButton onClick={() => void fetchQuestionnaires()}>重新加载问卷</ProductButton>}>无法确认投放数量，请重试。</ProductStatus> : questionnaires.length === 0 ? (
            <ProductStatus
              kind="info"
              title="暂无问卷"
              actions={<ProductButton variant="primary" onClick={() => navigate('/questionnaires')}>去创建问卷</ProductButton>}
            >
              当前课程还没有已发布的投放问卷。
            </ProductStatus>
          ) : (
            <div className="staff-course-detail-list">
              {questionnaires.map((questionnaire) => (
                <button
                  type="button"
                  key={questionnaire.kind + ":" + questionnaire.id}
                  className="staff-panel staff-course-detail-item"
                  disabled={!questionnaire.manageHref}
                  onClick={() => questionnaire.manageHref && navigate(questionnaire.manageHref)}
                >
                  <span className="staff-course-detail-item__main">
                    <span>
                      <strong className="staff-course-detail-item__title">{questionnaire.name}</strong>
                      {questionnaire.description && <span className="staff-course-detail-item__description">{questionnaire.description}</span>}
                    </span>
                    <span className="staff-badge">{questionnaire.unitCount} {questionnaire.unitLabel}</span>
                  </span>
                  <span className="staff-detail-meta">
                    {questionnaire.estimatedTime && <span>预计 {questionnaire.estimatedTime} 分钟</span>}
                    <span>{questionnaire.manageHref ? "查看问卷" : "已投放 · 由问卷创建者管理"}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </ProductPage>
  )
}

export default TeacherCourseDetail
