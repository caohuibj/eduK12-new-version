import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, Spin, Result, Button } from 'antd'
import { Clock, FileText } from 'lucide-react'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import type { CollectionQuestionnaireResponse } from '../../modules/reporting/types'
import { createPublicCapabilityClient } from '../../api/publicCapabilityClient'
import { readQuestionnaireResumeToken } from '../../utils/questionnaireResume'
import { normalizeApiError } from '../../utils/normalizeApiError'

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

const PublicQuestionnaireResult: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('sessionId')
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<CollectionQuestionnaireResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const questionnaireEntry = token ? `/public/questionnaire/${encodeURIComponent(token)}` : '/'

  const fetchReport = useCallback(async () => {
    setError(null)
    if (!sessionId) {
      setReport(null)
      setLoading(false)
      setError('缺少问卷会话参数，请从问卷入口重新进入结果页。')
      return
    }
    const resumeToken = readQuestionnaireResumeToken(token, sessionId)
    if (!resumeToken) {
      setReport(null)
      setLoading(false)
      setError('缺少本次问卷的恢复凭据，请从问卷入口重新进入或恢复测评。')
      return
    }
    try {
      setLoading(true)
      const client = createPublicCapabilityClient(resumeToken)
      const data = await client.get<CollectionQuestionnaireResponse>(`/assessments/${sessionId}/report`)
      setReport(data.data)
    } catch (cause) {
      setReport(null)
      setError(normalizeApiError(cause).message || '获取报告失败')
    } finally {
      setLoading(false)
    }
  }, [sessionId, token])

  useEffect(() => { void fetchReport() }, [fetchReport])

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Spin size="large" tip="正在生成报告..." /></div>
  if (error) {
    const canRetry = Boolean(sessionId && readQuestionnaireResumeToken(token, sessionId))
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="无法打开问卷报告"
          subTitle={error}
          extra={(
            <div className="flex flex-wrap justify-center gap-3">
              <Button type="primary" onClick={() => navigate(questionnaireEntry)}>返回问卷入口</Button>
              {canRetry ? <Button onClick={() => void fetchReport()}>重试读取报告</Button> : null}
            </div>
          )}
        />
      </div>
    )
  }
  if (!report) return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><Result status="warning" title="暂无报告" subTitle="报告正在生成中，请稍后再试" extra={<Button type="primary" onClick={() => navigate(questionnaireEntry)}>返回问卷入口</Button>} /></div>

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">{report.questionnaireName}</h1>
        <p className="text-center text-gray-600 mb-8">各量表结果独立展示</p>
        <Card className="mb-6 shadow-lg"><div className="flex items-center gap-6 text-sm text-gray-500 flex-wrap"><span>完成时间: {report.completedAt ? new Date(report.completedAt).toLocaleString('zh-CN') : '—'}</span>{report.totalTime != null && <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />总用时: {formatTime(report.totalTime)}</span>}<span className="flex items-center"><FileText className="w-4 h-4 mr-1" />{report.totalDimensions} 个维度</span></div></Card>
        {report.backgroundValues.length > 0 && <Card className="mb-6 shadow-lg"><h2 className="text-sm font-semibold text-gray-600 mb-2">背景信息</h2><div className="grid grid-cols-2 gap-2 text-sm text-gray-600">{report.backgroundValues.map((item) => <div key={item.itemId}><span className="font-medium">{item.label || '表单项'}：</span>{item.value ?? '—'}</div>)}</div></Card>}
        {report.unitReports.map((unitReport, index) => <Card key={unitReport.itemId || unitReport.scaleId || index} className="mb-6 shadow-lg"><h2 className="text-lg font-medium text-gray-900 mb-4">量表 {index + 1}: {unitReport.scaleName}</h2><ScaleUnitReportCard report={unitReport} /></Card>)}
      </div>
    </div>
  )
}

export default PublicQuestionnaireResult
