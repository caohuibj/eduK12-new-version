import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, ChevronRight, Clock } from 'lucide-react'
import { cognitiveApi } from '../api'
import type { CognitiveAssignmentSummary } from '../types'

/**
 * Cognitive Home（Stage B v1.1 §17/§23）—— 学生已发布认知测评列表。
 * 只展示安全 metadata，不展示任何敏感字段。
 */

const CognitiveHome: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<CognitiveAssignmentSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchList = async () => {
      try {
        const response = await cognitiveApi.getMyAssignments()
        if (response.code === 0 && response.data) {
          setAssignments(response.data)
        } else {
          setError(response.message || '获取列表失败')
        }
      } catch (err) {
        setError((err as { message?: string }).message || '获取列表失败')
      } finally {
        setLoading(false)
      }
    }
    void fetchList()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <p className="text-gray-500">如持续失败，请联系老师</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center space-x-2 mb-6">
        <Brain className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-800">认知测评</h1>
        <button type="button" onClick={() => navigate('/student/cognitive/history')} className="ml-auto text-sm text-primary hover:underline">
          查看历史
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="card p-12 text-center">
          <Brain className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">暂无认知测评任务</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {assignments.map((item) => (
            <div
              key={item.id}
              className="card hover:shadow-md transition-shadow cursor-pointer p-5"
              onClick={() => navigate(`/student/cognitive/assignments/${item.id}`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-semibold text-gray-800">{item.title}</h3>
                    {item.config && (
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                        {item.config.testType} / {item.config.engineVersion}
                      </span>
                    )}
                  </div>
                  {item.course && <p className="text-sm text-gray-500 mt-1">{item.course.title}</p>}
                  {item.instruction && <p className="text-sm text-gray-600 mt-2">{item.instruction}</p>}
                  {item.dueAt && (
                    <p className="flex items-center text-xs text-gray-400 mt-2">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      截止: {new Date(item.dueAt).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CognitiveHome
