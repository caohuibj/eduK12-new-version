import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Clock, CheckCircle, XCircle, BookOpen } from 'lucide-react'
import apiClient from '../../api/client'
import type { Assignment, Submission } from '../../types'

const StudentAssignments: React.FC = () => {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<(Assignment & { submitted?: boolean; mySubmission?: Submission })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAssignments()
  }, [])

  const fetchAssignments = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/assignments/my')
      if (response.code === 0) {
        setAssignments(response.data.list)
      }
    } catch (error) {
      console.error('获取作业列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString || dateString === 'Invalid Date') return '无截止日期'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return '无截止日期'
      return date.toLocaleString('zh-CN')
    } catch {
      return '无截止日期'
    }
  }

  const isOverdue = (deadline?: string) => {
    if (!deadline) return false
    return new Date(deadline) < new Date()
  }

  const getStatus = (assignment: Assignment & { submitted?: boolean }) => {
    if (assignment.submitted) {
      return { label: '已提交', color: 'text-green-500', bgColor: 'bg-green-50', icon: CheckCircle }
    }
    if (isOverdue(assignment.deadline)) {
      return { label: '已截止', color: 'text-gray-500', bgColor: 'bg-gray-50', icon: XCircle }
    }
    return { label: '进行中', color: 'text-blue-500', bgColor: 'bg-blue-50', icon: Clock }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">我的作业</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : assignments.length === 0 ? (
        <div className="card text-center py-12">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">暂无作业</h3>
          <p className="text-gray-500">你还没有需要完成的作业</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const status = getStatus(assignment)
            const StatusIcon = status.icon

            return (
              <div
                key={assignment.id}
                onClick={() => navigate(`/student/assignments/${assignment.id}`)}
                className="card hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">
                      {assignment.title}
                    </h3>
                    {assignment.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {assignment.description}
                      </p>
                    )}
                    <div className="flex items-center space-x-4 text-sm">
                      <span className={`flex items-center space-x-1 ${
                        isOverdue(assignment.deadline) && !assignment.submitted
                          ? 'text-red-500'
                          : 'text-gray-500'
                      }`}>
                        <Clock className="w-4 h-4" />
                        <span>截止: {formatDate(assignment.deadline)}</span>
                      </span>
                      {assignment.course && (
                        <span className="flex items-center space-x-1 text-gray-500">
                          <BookOpen className="w-4 h-4" />
                          <span>{assignment.course.title}</span>
                        </span>
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

export default StudentAssignments
