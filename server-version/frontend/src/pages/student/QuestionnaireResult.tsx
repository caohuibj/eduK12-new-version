import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft, Clock, FileText } from 'lucide-react'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import type { CollectionQuestionnaireResponse } from '../../modules/reporting/types'

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

const QuestionnaireResult: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<CollectionQuestionnaireResponse | null>(null)

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const response = await apiClient.get<CollectionQuestionnaireResponse>(`/questionnaires/assessments/${assessmentId}/report`)
        if (response.code === 0 && response.data) setResult(response.data)
      } catch (err) {
        console.error('获取报告失败', err)
      } finally {
        setLoading(false)
      }
    }
    void fetchResult()
  }, [assessmentId])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">加载中...</div></div>
  if (!result) return <div className="text-center py-12"><p className="text-gray-500">报告不存在</p><Link to="/student/questionnaires" className="text-primary mt-4 inline-block">返回问卷列表</Link></div>

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button onClick={() => navigate('/student/questionnaires')} className="flex items-center text-gray-600 hover:text-gray-800 mb-4"><ArrowLeft className="w-4 h-4 mr-1" />返回列表</button>
        <h1 className="text-2xl font-bold text-gray-900">{result.questionnaireName}</h1>
        <p className="text-gray-600 mt-1">各量表结果独立展示</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-6 text-sm text-gray-500 flex-wrap">
          <span>完成时间: {result.completedAt ? new Date(result.completedAt).toLocaleString('zh-CN') : '—'}</span>
          {result.totalTime != null && <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />总用时: {formatTime(result.totalTime)}</span>}
          <span className="flex items-center"><FileText className="w-4 h-4 mr-1" />{result.totalDimensions} 个维度</span>
        </div>
      </div>

      {result.backgroundValues.length > 0 && <div className="bg-gray-50 rounded-lg p-4 mb-6"><h2 className="text-sm font-semibold text-gray-600 mb-2">背景信息</h2><div className="grid grid-cols-2 gap-2 text-sm text-gray-600">{result.backgroundValues.map((item) => <div key={item.itemId}><span className="font-medium">{item.label || '表单项'}：</span>{item.value ?? '—'}</div>)}</div></div>}
      {result.unitReports.map((report, index) => <div key={report.itemId || report.scaleId || index} className="bg-white rounded-lg shadow p-6 mb-6"><h2 className="text-lg font-medium text-gray-900 mb-4">量表 {index + 1}: {report.scaleName}</h2><ScaleUnitReportCard report={report} /></div>)}
    </div>
  )
}

export default QuestionnaireResult
