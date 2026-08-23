import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { cognitiveApi, publicCognitiveApi } from '../api'
import { readCognitiveRecoveryCredential } from '../core/recovery-credential'
import { resolveRunner, type MetricDefinition } from '../registry'
import type { CognitiveSession } from '../types'

const formatMetric = (definition: MetricDefinition, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  if (definition.displayType === 'percentage') return `${Math.round(number * 100)}%`
  if (definition.displayType === 'ms') return `${Math.round(number)} ms`
  return String(Math.round(number * 100) / 100)
}

const CognitiveResult: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPublic = searchParams.get('public') === '1'
  const recoveryToken = sessionId && isPublic ? readCognitiveRecoveryCredential(sessionId) : ''
  const sessionApi = useMemo(() => (isPublic ? publicCognitiveApi(recoveryToken) : cognitiveApi), [isPublic, recoveryToken])
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<CognitiveSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const load = async () => {
      try {
        const response = await sessionApi.getSession(sessionId)
        if (cancelled) return
        if (response.code === 0 && response.data) {
          setSession(response.data)
          if (response.data.status !== 'COMPLETED') setError('该测评尚未完成')
        } else setError(response.message || '结果不存在或不可访问')
      } catch (err) {
        if (!cancelled) setError((err as { message?: string }).message || '结果不存在或不可访问')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [sessionApi, sessionId])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>
  if (error || !session?.result) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-600 mb-4">{error || '暂无结果'}</p>
        <button onClick={() => navigate(isPublic ? '/' : '/student/cognitive')} className="btn-secondary">返回列表</button>
      </div>
    )
  }

  const { result } = session
  const entry = resolveRunner(session.testType, session.engineVersion)
  const report = session.reportDefinition
    ? {
        title: session.reportDefinition.title,
        headlineMetric: session.reportDefinition.headlineMetric || session.reportDefinition.primaryMetrics?.[0] || '',
        summaryMetrics: session.reportDefinition.primaryMetrics || session.reportDefinition.summaryMetrics || [],
        disclaimer: session.reportDefinition.disclaimer,
      }
    : entry?.reportDefinition
  const metricDefs = session.metricDefinitions
    ? Object.values(session.metricDefinitions).map((definition) => ({
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        displayType: definition.unit === 'ms' ? 'ms' as const : definition.unit === 'ratio' ? 'percentage' as const : 'number' as const,
      }))
    : (entry?.metricDefinitions ?? [])
  const interpretable = result.qualityFlags.interpretable !== false
  const metricValue = (key: string) => result.metrics?.[key]
  const headlineDefinition = report
    ? metricDefs.find((definition) => definition.key === report.headlineMetric)
    : undefined
  const detailDefinitions = metricDefs.filter((definition) => !report?.summaryMetrics.includes(definition.key))

  return (
    <div>
      <button onClick={() => navigate(isPublic ? '/' : '/student/cognitive')} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回列表
      </button>
      <div className="card p-8 max-w-2xl text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{report?.title ?? entry?.name ?? '测评完成'}</h1>
        <p className="text-sm text-gray-500 mb-6">
          尝试 #{session.attemptNo}（{session.testType} / {session.engineVersion}）
          {isPublic && session.anonymousCode ? ` · 匿名编号 ${session.anonymousCode}` : ''}
          {session.finishedAt ? ` · ${new Date(session.finishedAt).toLocaleString('zh-CN')}` : ''}
        </p>

        <div className={`rounded-lg px-4 py-3 mb-6 text-sm ${interpretable ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
          {interpretable ? '数据质量：本次结果可作任务表现参考。' : '本次数据不足以稳定解释，建议重新测量。'}
        </div>

        {interpretable && report && headlineDefinition && (
          <div className="mb-6">
            <div className="text-5xl font-bold text-primary">{formatMetric(headlineDefinition, metricValue(report.headlineMetric))}</div>
            <div className="text-sm text-gray-400 mt-1">{headlineDefinition.label}</div>
          </div>
        )}

        <div className={`rounded-lg mb-6 ${interpretable ? 'bg-primary/5 p-5' : 'bg-gray-50 p-4'}`}>
          <div className="text-sm text-gray-500">{report?.indexLabel ?? '表现指数'}</div>
          <div className={`font-bold ${interpretable ? 'text-4xl text-primary' : 'text-lg text-gray-400'}`}>
            {interpretable ? `${Math.round(result.score)} / 100` : '暂不显示'}
          </div>
        </div>

        {report && report.summaryMetrics.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {report.summaryMetrics.map((key) => {
              const definition = metricDefs.find((item) => item.key === key)
              return definition ? (
                <div key={key} className="rounded-lg bg-gray-50 px-4 py-3">
                  <div className="text-lg font-semibold text-gray-800">{formatMetric(definition, metricValue(key))}</div>
                  <div className="text-xs text-gray-500">{definition.label}</div>
                </div>
              ) : null
            })}
          </div>
        )}

        {detailDefinitions.length > 0 && (
          <div className="text-left border-t pt-4">
            <p className="text-sm font-semibold text-gray-600 mb-2">详细指标</p>
            <div className="grid grid-cols-2 gap-2">
              {detailDefinitions.map((definition) => (
                <div key={definition.key} className="flex justify-between text-sm">
                  <span className="text-gray-500">{definition.label}</span>
                  <span className="text-gray-800">{formatMetric(definition, metricValue(definition.key))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {interpretable && result.reference && result.reference.mode !== 'none' && (
          <div className="text-left mt-4 border-t pt-3">
            <p className="text-sm font-semibold text-gray-600">{result.reference.label}</p>
            {result.reference.available && result.reference.referencePosition !== null && (
              <p className="text-lg font-semibold text-gray-800 mt-1">参考位置 {result.reference.referencePosition} / 100</p>
            )}
            {result.reference.band && <p className="text-xs text-gray-400 mt-1">参考区间：{result.reference.band}</p>}
            <p className="text-xs text-gray-400 mt-1">{result.reference.disclaimer}</p>
          </div>
        )}

        {report?.practicalTips && report.practicalTips.length > 0 && (
          <div className="text-left mt-4 border-t pt-3">
            <p className="text-sm font-semibold text-gray-600 mb-2">实践建议</p>
            {report.practicalTips.map((tip) => <p key={tip} className="text-sm text-gray-500">{tip}</p>)}
          </div>
        )}
        {report?.disclaimer && <p className="text-xs text-gray-400 mt-6 border-t pt-3">{report.disclaimer}</p>}
      </div>
    </div>
  )
}

export default CognitiveResult
