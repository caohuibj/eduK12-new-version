import React, { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Users, ClipboardList, Calendar, Brain, Edit, UserCog, Settings, ClipboardCheck, RefreshCw } from 'lucide-react'
import apiClient from '../../api/client'
import type { Course, Assignment, Checkin } from '../../types'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

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
  const { feedback, confirm, success, error: showError } = useStaffFeedback()
  const [activeTab, setActiveTab] = useState<'assignments' | 'checkins' | 'questionnaires'>('assignments')
  const [course, setCourse] = useState<Course | null>(null)
  const [assignments, setAssignments] = useState<AssignmentWithStats[]>([])
  const [checkins, setCheckins] = useState<CheckinWithStats[]>([])
  const [scales, setScales] = useState<Scale[]>([])
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)

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
    <ProductPage width="management" className="space-y-6">
      <PageHeader title={course.title} description={course.description || '课程详情、学生与教学任务'} actions={<Link className="staff-primary-link" to={`/courses/${courseId}/students`}>管理学生</Link>} />
      {feedback}
      <section className="staff-detail-header" aria-label="课程概况">
        <div className="staff-detail-header__top">
          <div className="flex items-start gap-4">
            {course.coverUrl ? <img src={course.coverUrl} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100"><BookOpen className="h-9 w-9 text-slate-500" aria-hidden="true" /></div>}
            <div><strong className="text-lg">{course.isLibrary ? '库课程' : '授课课程'}</strong><div className="staff-detail-meta"><span>{course.studentCount || 0} 名学生</span><span>状态：{course.status === 'PUBLISHED' ? '已发布' : course.status === 'DRAFT' ? '草稿' : '已完结'}</span></div></div>
          </div>
          {!course.isLibrary && <ProductButton onClick={() => void rotateCourseCode()}><RefreshCw className="w-4 h-4" aria-hidden="true" />轮换课程码</ProductButton>}
        </div>
        <div className="staff-detail-meta"><span>课程码：<strong>{course.courseCode}</strong></span><Link to="/courses">返回课程列表</Link></div>
      </section>
      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                  >查看问卷</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </ProductPage>
  )
}

export default TeacherCourseDetail
