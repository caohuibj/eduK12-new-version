import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Card, Spin, Result, Button } from 'antd'
import { Clock, FileText } from 'lucide-react'

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

interface ReportData {
  questionnaireName: string
  completedAt: string
  totalTime: number
  aggregateReport: AggregateReport
}

const PublicQuestionnaireResult: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')

  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId) {
      fetchReport()
    }
  }, [sessionId])

  const fetchReport = async () => {
    try {
      setLoading(true)
      
      const response = await fetch(`/api/public/assessments/${sessionId}/report`)
      
      if (!response.ok) {
        throw new Error('获取报告失败')
      }

      const data = await response.json()
      setReport(data.data)
      
    } catch (err: any) {
      setError(err.message || '获取报告失败')
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
      <div className="flex justify-center items-center min-h-screen">
        <Spin size="large" tip="正在生成报告..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="报告生成失败"
          subTitle={error}
          extra={
            <Button type="primary" onClick={fetchReport}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  if (!report || !report.aggregateReport) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="warning"
          title="暂无报告"
          subTitle="报告正在生成中，请稍后再试"
        />
      </div>
    )
  }

  const aggregateReport = report.aggregateReport

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          {report.questionnaireName}
        </h1>
        <p className="text-center text-gray-600 mb-8">聚合测评报告</p>

        {/* Overall Summary */}
        <Card className="mb-6 shadow-lg">
          <h2 className="text-lg font-medium text-gray-900 mb-4">整体评估</h2>
          <p className="text-gray-700 leading-relaxed">{aggregateReport.overallSummary}</p>

          <div className="flex items-center gap-6 mt-6 text-sm text-gray-500 flex-wrap">
            <span>
              完成时间: {new Date(report.completedAt).toLocaleString('zh-CN')}
            </span>
            {report.totalTime && (
              <span className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                总用时: {formatTime(report.totalTime)}
              </span>
            )}
            <span className="flex items-center">
              <FileText className="w-4 h-4 mr-1" />
              {aggregateReport.totalDimensions} 个维度
            </span>
          </div>
        </Card>

        {/* Scale Reports */}
        {aggregateReport.scaleReports?.map((scaleReport, scaleIndex) => (
          <Card key={scaleReport.scaleId || scaleIndex} className="mb-6 shadow-lg">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
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
                        className={`h-3 rounded-full transition-all duration-500 ${
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
                    <p className="text-xl font-bold text-blue-600">{dim.score?.toFixed(1) || 0} 分</p>
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
          </Card>
        ))}

        <div className="text-center mt-8">
          <p className="text-gray-500 text-sm">
            本报告仅供参考，不代表任何医学诊断
          </p>
        </div>
      </div>
    </div>
  )
}

export default PublicQuestionnaireResult
