import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { cognitiveApi } from '../api'
import { resolveRunner } from '../registry'
import type { CognitiveSession } from '../types'
import type { MetricDefinition } from '../registry'

/**
 * CognitiveResult（Stage B v1.1 §21.3 + Milestone E §74）—— 通用结果渲染器。
 *
 * 只读展示服务器结果（GET /cognitive/sessions/:id → COMPLETED + stored decrypted result），
 * 刷新走同一接口恢复，**不重新评分**。
 *
 * Milestone E R1（用户确认）：展示层由前端 Registry 的静态 metadata 驱动——
 *  - reportDefinition：标题 / headline 指标 / summary 指标 / disclaimer
 *  - metricDefinitions：指标 key → 中文 label + 单位 + 渲染样式
 * 后端只负责 metrics JSON + scoringVersion + qualityFlags；不建立独立 Report Engine。
 *
 * 若 testType/engineVersion 无 registry 条目（例如未来版本），回退为原始字典渲染，不崩坏。
 */

const formatMetric = (def: MetricDefinition, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  if (def.displayType === 'percentage') {
    // 后端 0..1 小数（accuracy / missRate）
    return `${Math.round(n * 100)}%`
  }
  if (def.displayType === 'ms') return `${Math.round(n)} ms`
  return String(Math.round(n * 100) / 100)
}

const CognitiveResult: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<CognitiveSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const fetchResult = async () => {
      try {
        const response = await cognitiveApi.getSession(sessionId)
        if (!cancelled) {
          if (response.code === 0 && response.data) {
            setSession(response.data)
            if (response.data.status !== 'COMPLETED') {
              setError('该测评尚未完成')
            }
          } else {
            setError(response.message || '结果不存在或不可访问')
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as { message?: string }).message || '结果不存在或不可访问')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchResult()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !session?.result) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-600 mb-4">{error || '暂无结果'}</p>
        <button onClick={() => navigate('/student/cognitive')} className="btn-secondary">
          返回列表
        </button>
      </div>
    )
  }

  const { result } = session
  const entry = resolveRunner(session.testType, session.engineVersion)
  const report = entry?.reportDefinition
  const metricDefs = entry?.metricDefinitions ?? []

  const metricValue = (key: string): unknown => result.metrics?.[key]

  return (
    <div>
      <button
        onClick={() => navigate('/student/cognitive')}
        className="flex items-center text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回列表
      </button>

      <div className="card p-8 max-w-2xl text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {report?.title ?? (entry?.name ?? '测评完成')}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          尝试 #{session.attemptNo}（{session.testType} / {session.engineVersion}）
          {session.finishedAt ? ` · ${new Date(session.finishedAt).toLocaleString('zh-CN')}` : ''}
        </p>

        {/* Headline 指标 */}
        {report ? (
          <div className="mb-6">
            <div className="text-5xl font-bold text-primary">
              {formatMetric(
                metricDefs.find((d) => d.key === report.headlineMetric) ?? { key: report.headlineMetric, label: report.headlineMetric, displayType: 'number' },
                metricValue(report.headlineMetric)
              )}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {metricDefs.find((d) => d.key === report.headlineMetric)?.label ?? '核心指标'}
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <div className="text-5xl font-bold text-primary">
              {typeof result.score === 'number' ? Math.round(result.score * 100) / 100 : '-'}
            </div>
            <div className="text-sm text-gray-400 mt-1">得分</div>
          </div>
        )}

        {/* Summary 指标 */}
        {report && report.summaryMetrics.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {report.summaryMetrics.map((key) => {
              const def = metricDefs.find((d) => d.key === key)
              if (def == null) return null
              return (
                <div key={key} className="rounded-lg bg-gray-50 px-4 py-3">
                  <div className="text-lg font-semibold text-gray-800">{formatMetric(def, metricValue(key))}</div>
                  <div className="text-xs text-gray-500">{def.label}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* 详细指标 */}
        {metricDefs.length > 0 ? (
          <div className="text-left border-t pt-4">
            <p className="text-sm font-semibold text-gray-600 mb-2">详细指标</p>
            <div className="grid grid-cols-2 gap-2">
              {metricDefs.map((def) => (
                <div key={def.key} className="flex justify-between text-sm">
                  <span className="text-gray-500">{def.label}</span>
                  <span className="text-gray-800">{formatMetric(def, metricValue(def.key))}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          result.metrics &&
          Object.keys(result.metrics).length > 0 && (
            <div className="text-left border-t pt-4">
              <p className="text-sm font-semibold text-gray-600 mb-2">指标</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-gray-500">{k}</span>
                    <span className="text-gray-800">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* Disclaimer */}
        {report?.disclaimer && (
          <p className="text-xs text-gray-400 mt-6 border-t pt-3">{report.disclaimer}</p>
        )}
      </div>
    </div>
  )
}

export default CognitiveResult
