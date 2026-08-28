import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { FileText, Clock, CheckCircle, ChevronRight } from 'lucide-react'

interface Scale {
  id: string
  code: string
  name: string
  description: string | null
  estimatedTime: number | null
  course: {
    id: string
    title: string
  } | null
  itemCount: number
  completed: boolean
  inProgress?: boolean
  completedAt: string | null
  assessmentId: string | null
  activeAttempt?: { id: string; startedAt: string; progress: number } | null
  latestCompletedAttempt?: { id: string; completedAt: string | null } | null
  attemptCount?: number
  retakeAllowed?: boolean
}

const StudentScales: React.FC = () => {
  const navigate = useNavigate()
  const [scales, setScales] = useState<Scale[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScales()
  }, [])

  const fetchScales = async () => {
    try {
      const response = await apiClient.get<{ list: Scale[] }>('/scales/available')
      if (response.code === 0) {
        setScales(response.data.list)
      }
    } catch (err) {
      console.error('获取量表列表失败', err)
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
        <h1 className="text-2xl font-bold text-gray-900">心理测评</h1>
        <p className="text-gray-600 mt-1">完成心理量表测评，了解自己的心理状态</p>
      </div>

      {scales.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">暂无可用的心理量表</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {scales.map((scale) => (
            <div
              key={scale.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                if (scale.inProgress) {
                  navigate(`/student/scales/${scale.id}`)
                } else if (scale.completed && scale.assessmentId) {
                  navigate(`/student/scales/result/${scale.assessmentId}`)
                } else {
                  navigate(`/student/scales/${scale.id}`)
                }
              }}
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-gray-900">{scale.name}</h3>
                      {scale.inProgress && (
                        <span className="text-blue-600 text-sm">进行中</span>
                      )}
                      {scale.completed && (
                        <span className="flex items-center text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          已完成
                        </span>
                      )}
                    </div>
                    {scale.description && (
                      <p className="text-gray-600 mt-1 text-sm">{scale.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                      <span className="flex items-center">
                        <FileText className="w-4 h-4 mr-1" />
                        {scale.itemCount} 道题目
                      </span>
                      {scale.estimatedTime && (
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          约 {scale.estimatedTime} 分钟
                        </span>
                      )}
                      {scale.course && (
                        <span className="text-blue-600">
                          课程: {scale.course.title}
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

export default StudentScales
