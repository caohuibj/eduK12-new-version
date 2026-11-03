import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import type { CollectionQuestionnaireResponse } from '../../modules/reporting/types'
import { createPublicCapabilityClient } from '../../api/publicCapabilityClient'
import { readQuestionnaireResumeToken } from '../../utils/questionnaireResume'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { ReportSection, ReportSupporting } from '../../modules/reporting/ReportPrimitives'

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
  const [readRevision, setReadRevision] = useState(0)
  const questionnaireEntry = token ? `/public/questionnaire/${encodeURIComponent(token)}` : '/'

  const loadReportImage = useCallback(async (assetId: string) => {
    const resumeToken = sessionId ? readQuestionnaireResumeToken(token, sessionId) : null
    if (!sessionId || !resumeToken) throw new Error('缺少本次问卷的恢复凭据')
    const response = await fetch(`/api/public/assessments/${encodeURIComponent(sessionId)}/report/assets/${encodeURIComponent(assetId)}`, { credentials: 'omit', headers: { Authorization: `Bearer ${resumeToken}` } })
    if (!response.ok) throw new Error('反馈图片暂时无法读取')
    return response.blob()
  }, [sessionId, token])

  useEffect(() => {
    let cancelled = false
    const fetchReport = async () => {
      setError(null)
      setReport(null)
      if (!sessionId) {
        setLoading(false)
        setError('缺少问卷会话参数，请从问卷入口重新进入结果页。')
        return
      }
      const resumeToken = readQuestionnaireResumeToken(token, sessionId)
      if (!resumeToken) {
        setLoading(false)
        setError('缺少本次问卷的恢复凭据，请从问卷入口重新进入或恢复测评。')
        return
      }
      try {
        setLoading(true)
        const client = createPublicCapabilityClient(resumeToken)
        const data = await client.get<CollectionQuestionnaireResponse>(`/assessments/${sessionId}/report`)
        if (!cancelled) setReport(data.data)
      } catch (cause) {
        if (!cancelled) {
          setReport(null)
          setError(normalizeApiError(cause).message || '获取报告失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchReport()
    return () => { cancelled = true }
  }, [sessionId, token, readRevision])

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
              {canRetry ? <ProductButton onClick={() => setReadRevision(value => value + 1)}>重试读取报告</ProductButton> : null}
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
      <PageHeader title={report.unitReports.length === 1 ? report.unitReports[0].scaleName : report.questionnaireName} description={report.unitReports.length === 1 ? undefined : '各量表结果独立展示，不生成跨量表总体分。'} />
      <div className="report-body">
        {report.unitReports.map((unitReport, index) => (
          <ReportSection
            key={unitReport.itemId || unitReport.scaleId || index}
            title={unitReport.scaleName}
            className={report.unitReports.length === 1 ? "report-single-unit" : undefined}
            eyebrow={`量表 ${index + 1}`}
          >
            <ScaleUnitReportCard report={unitReport} loadReportImage={loadReportImage} compactMetadata />
          </ReportSection>
        ))}
        <ReportSupporting testId="public-questionnaire-completion-facts" facts={[
          {label:'完成时间',value:report.completedAt ? new Date(report.completedAt).toLocaleString('zh-CN') : '—'},
          ...(report.totalTime != null ? [{label:'总用时',value:formatTime(report.totalTime)}] : []),
          {label:'报告维度',value:`${report.totalDimensions} 个维度`},
        ]}>
        {report.unitReports.length === 1 && <p>问卷：<span>{report.questionnaireName}</span></p>}
        {report.backgroundValues.length > 0 && (
          <section className="report-supporting__section"><h3>表单回答</h3>
            <dl className="hui-public-questionnaire-report__background">
              {report.backgroundValues.map((item) => (
                <div key={item.itemId}>
                  <dt>{item.label || '表单项'}</dt>
                  <dd>{item.displayValue ?? item.value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        </ReportSupporting>
      </div>
    </ProductPage>
  )
}

export default PublicQuestionnaireResult
