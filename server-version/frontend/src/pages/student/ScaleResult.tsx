import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import ReportShell from '../../modules/reporting/ReportShell'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import Dass21StudentReport from '../../modules/reporting/Dass21StudentReport'
import type { ScaleResultV2, ScaleUnitReport } from '../../modules/reporting/types'

export interface Assessment {
  id: string
  status: string
  result?: ScaleResultV2 | null
  decryptError?: boolean
  startedAt: string
  completedAt: string | null
  totalTime: number | null
  scale: {
    id: string
    code: string | null
    name: string
    description: string | null
  }
}

export const toScaleUnitReport = (value: Assessment): ScaleUnitReport => {
  const disclaimer = value.result?.disclaimer ?? '量表结果仅反映本次作答，不构成医学诊断或人口常模。'
  return {
    itemId: value.id,
    type: 'SCALE',
    kind: 'scale',
    scaleId: value.scale.id,
    scaleCode: value.scale.code,
    label: value.scale.name,
    scaleName: value.scale.name,
    result: value.result ?? null,
    quality: value.result?.quality ?? null,
    scores: value.result?.scores ?? [],
    references: value.result?.references ?? [],
    interpretations: value.result?.interpretations ?? [],
    caveats: value.result?.caveats ?? [],
    disclaimer,
    completedAt: value.completedAt,
    totalTime: value.totalTime,
    method: value.result?.method ?? null,
    ...(value.decryptError ? { decryptError: true } : {}),
  }
}

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

const ScaleResult: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchResult = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiClient.get<Assessment>(`/scales/assessments/${assessmentId}`)
        if (cancelled) return
        if (response.code === 0 && response.data) {
          setAssessment(response.data)
        } else {
          setAssessment(null)
          setError(response.message || '测评结果不存在或不可访问')
        }
      } catch (err) {
        if (!cancelled) {
          setAssessment(null)
          setError((err as { message?: string }).message || '报告读取失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchResult()
    return () => { cancelled = true }
  }, [assessmentId])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载报告中...</div>
  }

  if (!assessment) {
    return (
      <ReportShell
        title="量表报告"
        description="无法读取当前结果记录。"
        status={{ kind: 'error', title: '报告暂时无法打开', description: error || '测评结果不存在或不可访问' }}
        actions={<button type="button" onClick={() => navigate('/student/scales')} className="btn-secondary">返回量表列表</button>}
      />
    )
  }

  const facts = [
    ...(assessment.completedAt ? [{ label: '完成时间', value: new Date(assessment.completedAt).toLocaleString('zh-CN') }] : []),
    ...(assessment.totalTime != null ? [{ label: '用时', value: formatTime(assessment.totalTime) }] : []),
  ]
  const isDass21 = assessment.scale.code === 'dass21_zh_cn'

  return (
    <ReportShell
      title={assessment.scale.name}
      description={isDass21 ? '完成反馈' : '测评报告'}
      facts={facts}
      status={{
        kind: 'success',
        title: '已提交',
        description: isDass21
          ? '下面是一份不提供分数或心理健康标签的描述性反馈。'
          : '以下内容来自当前已完成结果记录。',
      }}
      backAction={<button type="button" onClick={() => navigate('/student/scales')} className="btn-secondary">返回量表列表</button>}
    >
      {isDass21 ? (
        <Dass21StudentReport />
      ) : (
        <section className="card p-6" aria-labelledby="scale-report-detail-heading">
          <h2 id="scale-report-detail-heading" className="text-lg font-semibold text-gray-800 mb-4">结果详情</h2>
          <ScaleUnitReportCard report={toScaleUnitReport(assessment)} />
        </section>
      )}
    </ReportShell>
  )
}

export default ScaleResult
