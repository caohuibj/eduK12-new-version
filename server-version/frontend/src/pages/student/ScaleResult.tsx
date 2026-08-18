import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft, Download, Share2 } from 'lucide-react'

interface DimensionScore {
  dimensionId: string
  dimensionCode: string
  dimensionName: string
  rawScore: number
  normalizedScore: number
  level: 'high' | 'medium' | 'low'
  itemCount: number
}

interface Feedback {
  overall: string
  dimensions: Array<{
    dimensionId: string
    dimensionCode: string
    dimensionName: string
    score: number
    minScore: number
    maxScore: number
    level: string
    levelName?: string
    interpretation: string
    suggestions: string[]
  }>
  feedbackLevel: string
}

interface Assessment {
  id: string
  status: string
  scores: DimensionScore[]
  feedback: Feedback
  startedAt: string
  completedAt: string
  totalTime: number
  scale: {
    id: string
    name: string
    description: string | null
  }
}

const ScaleResult: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState<Assessment | null>(null)

  useEffect(() => {
    fetchResult()
  }, [assessmentId])

  const fetchResult = async () => {
    try {
      const response = await apiClient.get<Assessment>(`/scales/assessments/${assessmentId}`)
      if (response.code === 0) {
        setAssessment(response.data)
      }
    } catch (err) {
      console.error('获取测评结果失败', err)
    } finally {
      setLoading(false)
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-green-600 bg-green-100'
      case 'medium':
        return 'text-yellow-600 bg-yellow-100'
      case 'low':
        return 'text-blue-600 bg-blue-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getLevelLabel = (level: string, levelName?: string) => {
    // 优先使用自定义等级名称
    if (levelName) return levelName
    
    switch (level) {
      case 'high':
        return '较高'
      case 'medium':
        return '中等'
      case 'low':
        return '较低'
      default:
        return level
    }
  }

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">测评结果不存在</p>
        <Link to="/student/scales" className="text-primary mt-4 inline-block">
          返回量表列表
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/student/scales')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回列表
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{assessment.scale.name}</h1>
        <p className="text-gray-600 mt-1">测评报告</p>
      </div>

      {/* Overall */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">总体评价</h2>
        <p className="text-gray-700 leading-relaxed">{assessment.feedback.overall}</p>
        
        <div className="flex items-center gap-6 mt-6 text-sm text-gray-500">
          <span>
            完成时间: {new Date(assessment.completedAt).toLocaleString('zh-CN')}
          </span>
          {assessment.totalTime && (
            <span>用时: {formatTime(assessment.totalTime)}</span>
          )}
        </div>
      </div>

      {/* Scores */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">维度得分</h2>

        {/* Score Chart */}
        <div className="space-y-4 mb-6">
          {assessment.feedback.dimensions.map((dim) => {
            const minScore = dim.minScore ?? 0
            const maxScore = dim.maxScore ?? 100
            // 计算进度条百分比（基于实际分数区间）
            const progressPercent = maxScore > minScore
              ? Math.max(0, Math.min(100, ((dim.score - minScore) / (maxScore - minScore)) * 100))
              : 0

            return (
              <div key={dim.dimensionId}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {dim.dimensionName}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getLevelColor(dim.level)}`}>
                    {getLevelLabel(dim.level, dim.levelName)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${
                      dim.level === 'high'
                        ? 'bg-green-500'
                        : dim.level === 'medium'
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{minScore}</span>
                  <span className="font-medium">{(dim.score ?? 0).toFixed(1)}分</span>
                  <span>{maxScore}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Dimension Details */}
      <div className="space-y-4">
        {assessment.feedback.dimensions.map((dim) => (
          <div key={dim.dimensionId} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">{dim.dimensionName}</h3>
              <span className={`text-sm px-3 py-1 rounded-full ${getLevelColor(dim.level)}`}>
                {getLevelLabel(dim.level, dim.levelName)}
              </span>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">得分</h4>
              <p className="text-2xl font-bold text-primary">{dim.score?.toFixed(1) || 0} 分</p>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">解读</h4>
              <p className="text-gray-600">{dim.interpretation}</p>
            </div>
            
            {dim.suggestions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">建议</h4>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  {dim.suggestions.map((suggestion, idx) => (
                    <li key={idx}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ScaleResult
