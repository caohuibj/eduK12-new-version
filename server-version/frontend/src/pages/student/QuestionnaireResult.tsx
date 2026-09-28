import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import ReportShell from '../../modules/reporting/ReportShell'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import type { CollectionQuestionnaireResponse } from '../../modules/reporting/types'
import { ReportSection } from '../../modules/reporting/ReportPrimitives'

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

  if (loading) {
    return (
      <ReportShell
        title="聚合问卷报告"
        description="正在读取已完成的问卷结果。"
        status={{ kind: 'pending', title: '加载报告中', announce: 'polite' }}
      />
    )
  }

  if (!result) {
    return (
      <ReportShell
        title="聚合问卷报告"
        description="无法读取当前结果记录。"
        status={{ kind: 'error', title: '报告不存在或暂时无法读取' }}
        actions={<button type="button" onClick={() => navigate('/student/questionnaires')} className="btn-secondary">返回问卷列表</button>}
      />
    )
  }

  const facts = [
    { label: '完成时间', value: result.completedAt ? new Date(result.completedAt).toLocaleString('zh-CN') : '—' },
    ...(result.totalTime != null ? [{ label: '总用时', value: formatTime(result.totalTime) }] : []),
    { label: '结果维度', value: `${result.totalDimensions} 个维度` },
  ]

  return (
    <ReportShell
      title={result.questionnaireName}
      description="各量表结果独立展示。"
      facts={facts}
      status={{ kind: 'success', title: '问卷已完成', description: '以下内容来自当前已完成结果记录。' }}
      backAction={<button type="button" onClick={() => navigate('/student/questionnaires')} className="btn-secondary">返回问卷列表</button>}
    >
      {result.backgroundValues.length > 0 && (
        <ReportSection title="背景信息" eyebrow="Context">
          <div className="report-metric-grid">
            {result.backgroundValues.map((item) => (
              <div key={item.itemId} className="report-metric">
                <div className="report-metric__label">{item.label || '表单项'}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{item.value ?? '—'}</div>
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {result.unitReports.length > 1 && (
        <ReportSection title="报告目录" eyebrow="Scales" description="问卷内各量表保持独立评分、解释与 reference。">
          <nav className="report-module-index" aria-label="问卷量表目录">
            {result.unitReports.map((report, index) => <a key={report.itemId || report.scaleId || index} href={`#questionnaire-unit-${index}`}>{index + 1}. {report.scaleName}</a>)}
          </nav>
        </ReportSection>
      )}
      {result.unitReports.map((report, index) => (
        <ReportSection key={report.itemId || report.scaleId || index} id={`questionnaire-unit-${index}`} title={`量表 ${index + 1}: ${report.scaleName}`} eyebrow="Scale">
          <ScaleUnitReportCard report={report} />
        </ReportSection>
      ))}
    </ReportShell>
  )
}

export default QuestionnaireResult
