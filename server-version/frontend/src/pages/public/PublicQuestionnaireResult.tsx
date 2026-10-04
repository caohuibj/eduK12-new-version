import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Clock, FileText } from 'lucide-react'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import type { CollectionQuestionnaireResponse } from '../../modules/reporting/types'
import { createPublicCapabilityClient } from '../../api/publicCapabilityClient'
import { readQuestionnaireResumeToken } from '../../utils/questionnaireResume'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { ReportCoreSummary, ReportSection } from '../../modules/reporting/ReportPrimitives'

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

  if (loading) {
    return (
      <ProductPage width="report" className="hui-report hui-public-questionnaire-report hui-public-participation--centered">
        <ProductStatus kind="pending" title="正在生成报告" announce="polite">
          正在读取本次匿名问卷的授权报告。
        </ProductStatus>
      </ProductPage>
    )
  }

  if (error) {
    const canRetry = Boolean(sessionId && readQuestionnaireResumeToken(token, sessionId))
    return (
      <ProductPage width="report" className="hui-report hui-public-questionnaire-report hui-public-participation--centered">
        <ProductStatus
          kind="error"
          title="无法打开问卷报告"
          announce="assertive"
          actions={(
            <div className="hui-public-participation__inline-actions">
              <ProductButton variant="primary" onClick={() => navigate(questionnaireEntry)}>返回问卷入口</ProductButton>
              {canRetry ? <ProductButton onClick={() => void fetchReport()}>重试读取报告</ProductButton> : null}
            </div>
          )}
        >
          {error}
        </ProductStatus>
      </ProductPage>
    )
  }

  if (!report) {
    return (
      <ProductPage width="report" className="hui-report hui-public-questionnaire-report hui-public-participation--centered">
        <ProductStatus
          kind="warning"
          title="暂无报告"
          actions={<ProductButton variant="primary" onClick={() => navigate(questionnaireEntry)}>返回问卷入口</ProductButton>}
        >
          报告正在生成中，请稍后再试。
        </ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="report" className="hui-report hui-public-questionnaire-report">
      <PageHeader title={report.questionnaireName} description="各量表结果独立展示，不生成跨量表总体分。" />

      <ReportCoreSummary label="报告说明">
        <p>本页展示本次匿名问卷中已经生成的量表结果。不同量表和维度保留各自的计分与解释语义。</p>
      </ReportCoreSummary>

      <div className="report-facts" data-testid="public-questionnaire-completion-facts">
        <dl>
          <div>
            <dt>完成时间</dt>
            <dd>{report.completedAt ? new Date(report.completedAt).toLocaleString('zh-CN') : '—'}</dd>
          </div>
          {report.totalTime != null && (
            <div>
              <dt><Clock size={13} aria-hidden="true" className="inline mr-1" />总用时</dt>
              <dd>{formatTime(report.totalTime)}</dd>
            </div>
          )}
          <div>
            <dt><FileText size={13} aria-hidden="true" className="inline mr-1" />报告维度</dt>
            <dd>{report.totalDimensions} 个维度</dd>
          </div>
        </dl>
      </div>

      <div className="report-body">
        {report.backgroundValues.length > 0 && (
          <ReportSection title="背景信息" eyebrow="问卷背景">
            <dl className="hui-public-questionnaire-report__background">
              {report.backgroundValues.map((item) => (
                <div key={item.itemId}>
                  <dt>{item.label || '表单项'}</dt>
                  <dd>{item.displayValue ?? item.value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </ReportSection>
        )}

        {report.unitReports.map((unitReport, index) => (
          <ReportSection
            key={unitReport.itemId || unitReport.scaleId || index}
            title={unitReport.scaleName}
            eyebrow={`量表 ${index + 1}`}
          >
            <ScaleUnitReportCard report={unitReport} />
          </ReportSection>
        ))}
      </div>
    </ProductPage>
  )
}

export default PublicQuestionnaireResult
