import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, CheckCircle, XCircle } from 'lucide-react'
import apiClient from '../../api/client'
import type { Checkin, CheckinSubmission } from '../../types'

const StudentCheckins: React.FC = () => {
  const navigate = useNavigate()
  const [checkins, setCheckins] = useState<(Checkin & { submission?: CheckinSubmission })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCheckins()
  }, [])

  const fetchCheckins = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/checkins/my')
      if (response.code === 0) {
        setCheckins(response.data.list)
      }
    } catch (error) {
      console.error('获取打卡列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '无截止日期'
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const isOverdue = (endTime?: string) => {
    if (!endTime) return false
    return new Date(endTime) < new Date()
  }

  const getStatus = (checkin: Checkin & { submission?: CheckinSubmission }) => {
    if (checkin.submission) {
      return { label: '已打卡', color: 'text-green-500', bgColor: 'bg-green-50', icon: CheckCircle }
    }
    if (isOverdue(checkin.endTime)) {
      return { label: '已截止', color: 'text-gray-500', bgColor: 'bg-gray-50', icon: XCircle }
    }
    return { label: '进行中', color: 'text-blue-500', bgColor: 'bg-blue-50', icon: Clock }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">我的打卡</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : checkins.length === 0 ? (
        <div className="card text-center py-12">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">暂无打卡</h3>
          <p className="text-gray-500">你还没有需要打卡的任务</p>
        </div>
      ) : (
        <div className="space-y-4">
          {checkins.map((checkin) => {
            const status = getStatus(checkin)
            const StatusIcon = status.icon

            return (
              <div
                key={checkin.id}
                onClick={() => navigate(`/student/checkins/${checkin.id}`)}
                className="card hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      {checkin.title}
                    </h3>
                    {checkin.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {checkin.description}
                      </p>
                    )}
                    <div className="flex items-center space-x-4 text-sm">
                      <span className="flex items-center space-x-1 text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>截止: {formatDate(checkin.endTime)}</span>
                      </span>
                      {checkin.courseName && (
                        <span className="text-gray-500">课程: {checkin.courseName}</span>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center space-x-1 px-3 py-1 rounded-full ${status.bgColor} ${status.color}`}>
                    <StatusIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">{status.label}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default StudentCheckins
