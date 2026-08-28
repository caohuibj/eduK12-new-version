import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { FileText, Clock, CheckCircle, ChevronRight, Layers, PlayCircle } from 'lucide-react'

interface Questionnaire {
  id: string
  code: string
  name: string
  description: string | null
  instruction: string | null
  estimatedTime: number | null
  scaleCount: number
  totalItems: number
  courses: Array<{
    id: string
    title: string
  }>
  completed: boolean
  inProgress: boolean
  completedAt: string | null
  assessmentId: string | null
  activeAttempt?: { id: string; startedAt: string; progress: number } | null
  latestCompletedAttempt?: { id: string; completedAt: string | null } | null
  attemptCount?: number
  retakeAllowed?: boolean
}

const StudentQuestionnaires: React.FC = () => {
  const navigate = useNavigate()
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchQuestionnaires()
  }, [])

  const fetchQuestionnaires = async () => {
    try {
      const response = await apiClient.get<{ list: Questionnaire[] }>('/questionnaires/available')
      if (response.code === 0) {
        setQuestionnaires(response.data.list)
      }
    } catch (err) {
      console.error('获取问卷列表失败', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">聚合问卷</h1>
        <p className="text-gray-600 mt-1">一次性完成多个心理量表的测评</p>
      </div>

      {questionnaires.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">暂无可用的问卷</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {questionnaires.map((qn) => (
            <div
              key={qn.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                if (qn.inProgress) {
                  navigate(`/student/questionnaires/${qn.id}`)
                } else if (qn.completed && qn.assessmentId) {
                  navigate(`/student/questionnaires/result/${qn.assessmentId}`)
                } else {
                  navigate(`/student/questionnaires/${qn.id}`)
                }
              }}
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-gray-900">{qn.name}</h3>
                      {qn.completed && (
                        <span className="flex items-center text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          已完成
                        </span>
                      )}
                      {qn.inProgress && (
                        <span className="flex items-center text-amber-600 text-sm">
                          <PlayCircle className="w-4 h-4 mr-1" />
                          进行中
                        </span>
                      )}
                    </div>
                    {qn.description && (
                      <p className="text-gray-600 mt-1 text-sm">{qn.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                      <span className="flex items-center">
                        <Layers className="w-4 h-4 mr-1" />
                        {qn.scaleCount} 个量表
                      </span>
                      <span className="flex items-center">
                        <FileText className="w-4 h-4 mr-1" />
                        {qn.totalItems} 道题目
                      </span>
                      {qn.estimatedTime && (
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          约 {qn.estimatedTime} 分钟
                        </span>
                      )}
                      {qn.courses.length > 0 && (
                        <span className="text-blue-600">
                          课程: {qn.courses[0].title}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default StudentQuestionnaires
