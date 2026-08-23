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

const profileLabel = (profile: CognitiveSession['profile']): string => {
  if (profile === 'experience') return '体验版'
  if (profile === 'research') return '科研版'
  if (profile === 'standard') return '正式版'
  return ''
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
        primaryMetrics: session.reportDefinition.primaryMetrics || session.reportDefinition.summaryMetrics || [],
        secondaryMetrics: session.reportDefinition.secondaryMetrics || [],
        disclaimer: session.reportDefinition.disclaimer,
      }
    : entry?.reportDefinition
      ? {
          title: entry.reportDefinition.title,
          headlineMetric: entry.reportDefinition.headlineMetric,
          primaryMetrics: entry.reportDefinition.summaryMetrics,
          secondaryMetrics: [],
          disclaimer: entry.reportDefinition.disclaimer,
        }
      : undefined
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
  const primaryKeys = report?.primaryMetrics ?? []
  const secondaryKeys = (report?.secondaryMetrics && report.secondaryMetrics.length > 0)
    ? report.secondaryMetrics
    : metricDefs
      .map((definition) => definition.key)
      .filter((key) => key !== report?.headlineMetric && !primaryKeys.includes(key))
  const renderMetricCards = (keys: string[]) => keys.map((key) => {
    const definition = metricDefs.find((item) => item.key === key)
    return definition ? (
      <div key={key} className="rounded-lg bg-gray-50 px-4 py-3">
        <div className="text-lg font-semibold text-gray-800">{formatMetric(definition, metricValue(key))}</div>
        <div className="text-xs text-gray-500">{definition.label}</div>
      </div>
    ) : null
  })
  const qualityLabels = Object.entries(result.qualityFlags)
    .filter(([key, value]) => key !== 'interpretable' && value === true)
    .map(([key]) => session.qualityDefinitions?.[key]?.label ?? key)
  const comparison = result.reference?.comparison
  const tips = entry?.reportDefinition?.practicalTips ?? []

  return (
    <div>
      <button onClick={() => navigate(isPublic ? '/' : '/student/cognitive')} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回列表
      </button>
      <div className="card p-8 max-w-2xl text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{report?.title ?? entry?.name ?? '测评完成'}</h1>
        <p className="text-sm text-gray-500 mb-6">
          尝试 #{session.attemptNo}（{session.testType} / {session.engineVersion}
          {profileLabel(session.profile) ? ` · ${profileLabel(session.profile)}` : ''}
          {isPublic && session.anonymousCode ? ` · 匿名编号 ${session.anonymousCode}` : ''}
          {session.finishedAt ? ` · ${new Date(session.finishedAt).toLocaleString('zh-CN')}` : ''}）
        </p>

        <section className="text-left mb-6">
          <h2 className="text-sm font-semibold text-gray-600 mb-2">数据质量</h2>
          <div className={`rounded-lg px-4 py-3 text-sm ${interpretable ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
            {interpretable ? '数据质量：本次结果可作任务表现参考。' : '本次数据不足以稳定解释，建议重新测量。'}
          </div>
          {qualityLabels.length > 0 && (
            <ul className="mt-2 text-xs text-gray-500 list-disc list-inside">
              {qualityLabels.map((label) => <li key={label}>{label}</li>)}
            </ul>
          )}
        </section>

        {interpretable && report && headlineDefinition && (
          <div className="mb-6">
            <div className="text-5xl font-bold text-primary">{formatMetric(headlineDefinition, metricValue(report.headlineMetric))}</div>
            <div className="text-sm text-gray-400 mt-1">{headlineDefinition.label}</div>
          </div>
        )}

        <div className={`rounded-lg mb-6 ${interpretable ? 'bg-primary/5 p-5' : 'bg-gray-50 p-4'}`}>
          <div className="text-sm text-gray-500">任务表现指数</div>
          <div className={`font-bold ${interpretable ? 'text-4xl text-primary' : 'text-lg text-gray-400'}`}>
            {interpretable ? `${Math.round(result.score)} / 100` : '暂不显示'}
          </div>
        </div>

        {report && primaryKeys.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 mb-2 text-left">主要指标</h2>
            <div className="grid grid-cols-2 gap-3">{renderMetricCards(primaryKeys)}</div>
          </section>
        )}

        {report && secondaryKeys.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 mb-2 text-left">次级指标</h2>
            <div className="grid grid-cols-2 gap-3">{renderMetricCards(secondaryKeys)}</div>
          </section>
        )}

        {interpretable && result.reference && result.reference.mode !== 'none' && (
          <section className="text-left mt-4 border-t pt-3">
            <p className="text-sm font-semibold text-gray-600">{result.reference.label}</p>
            {result.reference.available && comparison && (
              <>
                <p className="text-lg font-semibold text-gray-800 mt-1">{comparison.rangeLabel}</p>
                <p className="text-xs text-gray-400 mt-1">
                  观察值 {comparison.observed} · 文献参考均值 {comparison.referenceMean}
                  {comparison.referenceSd ? `（SD ${comparison.referenceSd}）` : ''}
                </p>
              </>
            )}
            {result.reference.band && <p className="text-xs text-gray-400 mt-1">参考区间：{result.reference.band}</p>}
            <p className="text-xs text-gray-400 mt-1">{result.reference.disclaimer}</p>
          </section>
        )}

        {(session.reportCaveats && session.reportCaveats.length > 0) || tips.length > 0 ? (
          <section className="text-left mt-4 border-t pt-3">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">简要解释</h2>
            {session.reportCaveats?.map((caveat) => <p key={caveat} className="text-sm text-amber-800">{caveat}</p>)}
            {tips.map((tip) => <p key={tip} className="text-sm text-gray-500">{tip}</p>)}
          </section>
        ) : null}

        <section className="text-left mt-4 border-t pt-3">
          <h2 className="text-sm font-semibold text-gray-600 mb-2">方法说明</h2>
          <p className="text-xs text-gray-500">
            任务 {session.testType} · 引擎 {session.engineVersion} · 评分 {session.scoringVersion} · 配置 {session.configVersion}
            {session.profile ? ` · ${profileLabel(session.profile)}` : ''}
          </p>
        </section>

        {report?.disclaimer && <p className="text-xs text-gray-400 mt-6 border-t pt-3">{report.disclaimer}</p>}
      </div>
    </div>
  )
}

export default CognitiveResult
