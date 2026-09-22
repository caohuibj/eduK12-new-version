import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReportShell from '../../reporting/ReportShell'
import SituationalReportCard, { type SituationalReportView } from '../../reporting/SituationalReportCard'
import { situationalApi } from '../api'
import { situationalErrorMessage } from '../draft'
import { downloadSituationalExport } from '../export'
import type { SituationalAttemptResponse } from '../types'

const formatDuration = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

const SituationalResult: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<SituationalAttemptResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!attemptId) {
      setError('测评记录标识缺失')
      setLoading(false)
      return
    }

    void situationalApi.result(attemptId)
      .then((response) => {
        if (response.code !== 0) throw Object.assign(new Error(response.message), { code: response.code })
        if (!response.data.result) {
          navigate(`/student/situational/${encodeURIComponent(response.data.attempt.instrumentKey)}`, { replace: true })
          return
        }
        if (!cancelled) setData(response.data)
      })
      .catch((reason) => {
        if (!cancelled) setError(situationalErrorMessage(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [attemptId, navigate])

  if (loading) return <div className="flex min-h-[360px] items-center justify-center text-gray-500">加载权威结果…</div>

  if (error || !data || !data.result) {
    return (
      <ReportShell
        title="情境化测评报告"
        description="无法读取当前权威结果记录。"
        status={{ kind: 'error', title: '报告暂时无法打开', description: error || '结果暂时无法读取' }}
        actions={<button type="button" onClick={() => navigate('/student/situational/history')} className="btn-secondary">查看历史</button>}
      />
    )
  }

  const result = data.result
  const report: SituationalReportView = {
    itemId: data.attempt.id,
    type: 'SITUATIONAL',
    kind: 'situational',
    label: '情境化测评结果',
    scientificContext: data.instrument.scientificContext,
    instrumentKey: data.attempt.instrumentKey,
    instrumentVersion: data.attempt.instrumentVersion,
    scoringVersion: data.attempt.scoringVersion,
    metrics: result.metrics,
    metricOrder: data.instrument.report.metricOrder,
    interpretations: data.instrument.report.interpretations,
    disclaimer: data.instrument.report.disclaimer,
    qualityState: result.quality.status,
    qualityFlags: result.quality.flags,
    completedAt: data.attempt.completedAt,
    totalTime: data.attempt.totalTime,
  }
  const facts = [
    { label: '工具', value: `${data.attempt.instrumentKey} · v${data.attempt.instrumentVersion}` },
    { label: '评分版本', value: data.attempt.scoringVersion },
    ...(data.attempt.completedAt ? [{ label: '完成时间', value: new Date(data.attempt.completedAt).toLocaleString('zh-CN') }] : []),
    ...(data.attempt.totalTime != null ? [{ label: '用时', value: formatDuration(data.attempt.totalTime) }] : []),
  ]

  return (
    <ReportShell
      title="情境化测评报告"
      description="以下内容来自本次已完成 attempt 的冻结工具与权威结果。"
      facts={facts}
      status={{
        kind: 'success',
        title: '测评已完成',
        description: <><span>已提交</span> · 数据质量：{result.quality.status}</>,
      }}
      backAction={<Link to="/student/situational/history" aria-label="测评历史" className="btn-secondary">返回测评历史</Link>}
      limitations={[
        ...data.instrument.report.limitations,
        '本页面只展示服务器保存的 Construct × Channel 指标；没有百分位、常模或参考分布，不应把不同通道简单合成为单一人格结论。',
      ]}
      actions={
        <>
          <button type="button" aria-label="JSON" onClick={() => downloadSituationalExport(data, 'json')} className="btn-secondary inline-flex items-center gap-2"><Download className="h-4 w-4" />导出 JSON</button>
          <button type="button" aria-label="CSV" onClick={() => downloadSituationalExport(data, 'csv')} className="btn-secondary inline-flex items-center gap-2"><Download className="h-4 w-4" />导出 CSV</button>
          <Link to="/student/situational" className="btn-primary">返回题包</Link>
        </>
      }
    >
      <section className="card p-6" aria-labelledby="situational-result-details-title">
        <h2 id="situational-result-details-title" className="text-lg font-semibold text-gray-800 mb-4">结果详情</h2>
        <SituationalReportCard report={report} />
      </section>
    </ReportShell>
  )
}

export default SituationalResult
