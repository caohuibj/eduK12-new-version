import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import ReportShell from '../../modules/reporting/ReportShell'
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
        <section className="card p-5" aria-labelledby="questionnaire-background-heading">
          <h2 id="questionnaire-background-heading" className="text-sm font-semibold text-gray-700 mb-3">背景信息</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {result.backgroundValues.map((item) => (
              <div key={item.itemId} className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <div className="text-xs text-gray-500">{item.label || '表单项'}</div>
                <div className="mt-1 whitespace-pre-wrap">{item.value ?? '—'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {result.unitReports.map((report, index) => (
        <section key={report.itemId || report.scaleId || index} className="card p-6" aria-labelledby={`questionnaire-unit-${index}`}>
          <h2 id={`questionnaire-unit-${index}`} className="text-lg font-semibold text-gray-800 mb-4">
            量表 {index + 1}: {report.scaleName}
          </h2>
          <ScaleUnitReportCard report={report} />
        </section>
      ))}
    </ReportShell>
  )
}

export default QuestionnaireResult
