import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft, Clock, FileText } from 'lucide-react'

interface DimensionScore {
  dimensionId: string
  dimensionCode: string
  dimensionName: string
  rawScore: number
  normalizedScore: number
  level: 'high' | 'medium' | 'low'
  itemCount: number
}

interface ScaleReport {
  scaleId: string
  scaleName: string
  dimensionScores: DimensionScore[]
  feedback: {
    overall: string
    dimensions: Array<{
      dimensionId: string
      dimensionName: string
      score: number
      minScore: number
      maxScore: number
      level: string
      levelName?: string
      interpretation: string
      suggestions: string[]
    }>
  }
  completedAt: string
  totalTime: number
}

interface AggregateReport {
  questionnaireName: string
  scaleReports: ScaleReport[]
  totalDimensions: number
  averageScore: number
  overallSummary: string
}

interface QuestionnaireResultData {
  questionnaireName: string
  completedAt: string
  totalTime: number
  aggregateReport: AggregateReport
}

const QuestionnaireResult: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<QuestionnaireResultData | null>(null)

  useEffect(() => {
    fetchResult()
  }, [assessmentId])

  const fetchResult = async () => {
    try {
      const response = await apiClient.get<QuestionnaireResultData>(
        `/questionnaires/assessments/${assessmentId}/report`
      )
      if (response.code === 0) {
        setResult(response.data)
      }
    } catch (err) {
      console.error('获取报告失败', err)
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

  if (!result) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">报告不存在</p>
        <Link to="/student/questionnaires" className="text-primary mt-4 inline-block">
          返回问卷列表
        </Link>
      </div>
    )
  }

  const report = result.aggregateReport

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/student/questionnaires')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回列表
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{result.questionnaireName}</h1>
        <p className="text-gray-600 mt-1">聚合测评报告</p>
      </div>

      {/* Overall Summary */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">整体评估</h2>
        <p className="text-gray-700 leading-relaxed">{report.overallSummary}</p>

        <div className="flex items-center gap-6 mt-6 text-sm text-gray-500">
          <span>
            完成时间: {new Date(result.completedAt).toLocaleString('zh-CN')}
          </span>
          {result.totalTime && (
            <span className="flex items-center">
              <Clock className="w-4 h-4 mr-1" />
              总用时: {formatTime(result.totalTime)}
            </span>
          )}
          <span className="flex items-center">
            <FileText className="w-4 h-4 mr-1" />
            {report.totalDimensions} 个维度
          </span>
        </div>
      </div>

      {/* Scale Reports */}
      {report.scaleReports?.map((scaleReport, scaleIndex) => (
        <div key={scaleReport.scaleId || scaleIndex} className="mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              量表 {scaleIndex + 1}: {scaleReport.scaleName}
            </h2>

            {/* Dimension Scores */}
            <div className="space-y-4 mb-6">
              {scaleReport.feedback?.dimensions?.map((dim) => {
                const minScore = dim.minScore ?? 0
                const maxScore = dim.maxScore ?? 100
                const progressPercent = maxScore > minScore
                  ? Math.max(0, Math.min(100, ((dim.score - minScore) / (maxScore - minScore)) * 100))
                  : 0

                return (
                  <div key={dim.dimensionId || dim.dimensionName}>
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
              }) || <p className="text-gray-500 text-sm">暂无维度数据</p>}
            </div>

            {/* Overall Feedback */}
            {scaleReport.feedback?.overall && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">{scaleReport.feedback.overall}</p>
              </div>
            )}

            {/* Dimension Details */}
            <div className="space-y-4">
              {scaleReport.feedback?.dimensions?.map((dim) => (
                <div key={dim.dimensionId || dim.dimensionName} className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-900">{dim.dimensionName}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${getLevelColor(dim.level)}`}>
                      {getLevelLabel(dim.level, dim.levelName)}
                    </span>
                  </div>

                  <div className="mb-2">
                    <p className="text-xl font-bold text-primary">{dim.score?.toFixed(1) || 0} 分</p>
                  </div>

                  <p className="text-sm text-gray-600 mb-2">{dim.interpretation || ''}</p>

                  {dim.suggestions?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-1">建议</h4>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
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
        </div>
      ))}
    </div>
  )
}

export default QuestionnaireResult
