import CognitiveCredentialReset from './CognitiveCredentialReset'
import CognitiveSessionEntry from './CognitiveSessionEntry'
import { isPublicAssessmentPath } from '../../../components/app-shell/access'
import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ProductPage, ProductStatus } from '../../../components/product-ui'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportMetric,
  ReportMetricGrid,
  ReportSection,
} from '../../reporting/ReportPrimitives'
import { cognitiveApi, publicCognitiveApi } from '../api'
import { readCognitiveRecoveryCredential } from '../core/recovery-credential'
import { resolveRunner, type MetricDefinition } from '../registry'
import type { CognitiveSession, CognitiveV2Report } from '../types'
import CognitiveSingleTaskReportCard from '../CognitiveSingleTaskReportCard'
import CognitiveV2ReportCard from '../CognitiveV2ReportCard'

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

const isCognitiveV2Report = (value: unknown): value is CognitiveV2Report => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CognitiveV2Report>
  return typeof candidate.title === 'string'
    && typeof candidate.qualityState === 'string'
    && typeof candidate.conclusion === 'string'
    && Array.isArray(candidate.headline)
    && Array.isArray(candidate.user)
    && Array.isArray(candidate.detail)
    && Array.isArray(candidate.quality)
    && typeof candidate.method === 'object'
    && candidate.method !== null
    && typeof candidate.disclaimer === 'string'
    && Array.isArray(candidate.practicalTips)
}

const CognitiveResult: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const isPublic = isPublicAssessmentPath(useLocation().pathname)
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

  const back = () => navigate(isPublic ? '/' : '/student/cognitive')

  if (loading) {
    return <ProductPage width="report" className="hui-report"><ProductStatus kind="pending" title="正在加载认知测评报告" announce="polite">正在读取已冻结结果。</ProductStatus></ProductPage>
  }

  if (error || !session?.result) {
    return (
      <ProductPage width="report" className="hui-report">
        <ProductStatus kind="error" title="认知测评报告暂不可用">{error || '暂无结果'}</ProductStatus>
        <div className="mt-4 flex flex-wrap gap-2" data-report-screen-only>
          <button onClick={back} className="btn-secondary">返回列表</button>
          {isPublic && sessionId && <CognitiveCredentialReset sessionId={sessionId} />}
        </div>
      </ProductPage>
    )
  }

  const { result } = session
  const v2Report = isCognitiveV2Report(result.report) ? result.report : null
  if (v2Report) {
    const referenceRows = (result.references ?? [])
      .filter((reference) => reference && typeof reference === 'object') as Array<Record<string, unknown>>
    return (
      <ProductPage width="report" className="hui-report">
        <button onClick={back} className="mb-4 inline-flex min-h-11 items-center gap-2 text-gray-500 hover:text-gray-700" data-report-screen-only>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />返回列表
        </button>
        <CognitiveV2ReportCard
          report={v2Report}
          references={referenceRows}
          attemptNo={session.attemptNo}
          finishedAt={session.finishedAt}
          anonymousCode={isPublic ? session.anonymousCode : null}
        />
      </ProductPage>
    )
  }

  const entry = resolveRunner(session.testType, session.engineVersion)
  const report = session.reportDefinition
    ? {
        title: session.reportDefinition.title,
        headlineMetric: session.reportDefinition.headlineMetric || session.reportDefinition.primaryMetrics?.[0] || '',
        primaryMetrics: session.reportDefinition.primaryMetrics || session.reportDefinition.summaryMetrics || [],
        secondaryMetrics: session.reportDefinition.secondaryMetrics || [],
        showProductIndex: session.reportDefinition.showProductIndex,
        disclaimer: session.reportDefinition.disclaimer,
      }
    : entry?.reportDefinition
      ? {
          title: entry.reportDefinition.title,
          headlineMetric: entry.reportDefinition.headlineMetric,
          primaryMetrics: entry.reportDefinition.summaryMetrics,
          secondaryMetrics: [],
          showProductIndex: entry.reportDefinition.showProductIndex,
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
  const qualityFlagMap = result.qualityFlags ?? result.quality?.flags ?? {}
  const interpretable = qualityFlagMap.interpretable !== false
  const metricValue = (key: string) => result.metrics?.[key]
  const headlineDefinition = report ? metricDefs.find((definition) => definition.key === report.headlineMetric) : undefined
  const primaryKeys = report?.primaryMetrics ?? []
  const secondaryKeys = (report?.secondaryMetrics && report.secondaryMetrics.length > 0)
    ? report.secondaryMetrics
    : metricDefs.map((definition) => definition.key).filter((key) => key !== report?.headlineMetric && !primaryKeys.includes(key))
  const qualityLabels = Object.entries(qualityFlagMap)
    .filter(([key, value]) => key !== 'interpretable' && value === true)
    .map(([key]) => session.qualityDefinitions?.[key]?.label ?? key)
  const comparison = result.reference?.comparison
  const tips = session.testType === 'memory' || session.testType === 'stroop' ? [] : (session.reportDefinition?.practicalTips ?? [])

  const metricCards = (keys: string[]) => keys.map((key) => {
    const definition = metricDefs.find((item) => item.key === key)
    return definition ? (
      <ReportMetric key={key} label={definition.label} value={formatMetric(definition, metricValue(key))} />
    ) : null
  })

  return (
    <ProductPage width="report" className="hui-report">
      <button onClick={back} className="mb-4 inline-flex min-h-11 items-center gap-2 text-gray-500 hover:text-gray-700" data-report-screen-only>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />返回列表
      </button>

      {result.singleTaskReport ? (
        <CognitiveSingleTaskReportCard
          report={result.singleTaskReport}
          attemptNo={session.attemptNo}
          finishedAt={session.finishedAt}
          anonymousCode={isPublic ? session.anonymousCode : null}
        />
      ) : (
        <div className="space-y-5">
          <header>
            <h1 className="text-2xl font-bold text-gray-800">{report?.title ?? entry?.name ?? '测评完成'}</h1>
            <p className="mt-1 text-sm text-gray-500">
              尝试 #{session.attemptNo}（{profileLabel(session.profile) || '认知任务'}
              {isPublic && session.anonymousCode ? ` · 匿名编号 ${session.anonymousCode}` : ''}
              {session.finishedAt ? ` · ${new Date(session.finishedAt).toLocaleString('zh-CN')}` : ''}）
            </p>
          </header>

          {session.profile === 'experience' && (
            <ReportCoreSummary label="体验版 · 短程协议">
              <p className="text-sm font-normal">本报告使用正式评分器计算，但试次数较少，更适合描述本次体验，不用于人口百分位、年龄等级或稳定能力等级。</p>
            </ReportCoreSummary>
          )}

          <ReportSection title="数据质量" eyebrow="解释前提">
            <div className={`rounded-lg px-4 py-3 text-sm ${interpretable ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
              {interpretable ? '数据质量：本次结果可作任务表现参考。' : '本次数据不足以稳定解释，建议在相近设备和环境下重新测量。'}
            </div>
            {qualityLabels.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-gray-500">{qualityLabels.map((label) => <li key={label}>{label}</li>)}</ul>}
          </ReportSection>

          {interpretable && report && headlineDefinition && (
            <ReportSection title="核心指标" eyebrow="本次任务">
              <ReportMetric emphasis label={headlineDefinition.label} value={formatMetric(headlineDefinition, metricValue(report.headlineMetric))} />
            </ReportSection>
          )}

          {interpretable && report?.showProductIndex !== false && (
            <ReportSection title="任务表现指数">
              <ReportMetric label="任务表现指数" value={result.score !== undefined ? `${Math.round(result.score)} / 100` : '暂不显示'} description="内部综合指数，用于汇总本次任务表现；不代表百分位、年龄等级、学校成绩或诊断结论。" />
            </ReportSection>
          )}

          {interpretable && report && primaryKeys.length > 0 && (
            <ReportSection title="主要指标" eyebrow="任务表现">
              <ReportMetricGrid>{metricCards(primaryKeys)}</ReportMetricGrid>
            </ReportSection>
          )}

          {interpretable && report && secondaryKeys.length > 0 && (
            <ReportSection title="次级指标" eyebrow="补充信息">
              <ReportMetricGrid>{metricCards(secondaryKeys)}</ReportMetricGrid>
            </ReportSection>
          )}

          {interpretable && result.reference && result.reference.mode !== 'none' && (
            <ReportSection title={result.reference.label} eyebrow="参考信息">
              {result.reference.available && comparison && (
                <>
                  <p className="text-lg font-semibold text-gray-800">{comparison.rangeLabel}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    观察值 {comparison.observed} · {comparison.meanLabel || '参考均值'} {comparison.referenceMean}
                    {comparison.referenceSd ? `（SD ${comparison.referenceSd}）` : ''}
                  </p>
                </>
              )}
              {result.reference.band && <p className="mt-1 text-xs text-gray-500">参考区间：{result.reference.band}</p>}
              <p className="mt-1 text-xs text-gray-500">{result.reference.disclaimer}</p>
            </ReportSection>
          )}

          {((session.reportCaveats && session.reportCaveats.length > 0) || tips.length > 0) && (
            <ReportSection title="简要解释" eyebrow="阅读提示">
              {session.reportCaveats?.map((caveat) => <p key={caveat} className="text-sm text-amber-800">{caveat}</p>)}
              {tips.map((tip) => <p key={tip} className="text-sm text-gray-500">{tip}</p>)}
            </ReportSection>
          )}

          <ReportDetails title="方法说明（技术信息）">
            <p>
              任务 {session.testType} · 引擎 {session.engineVersion} · 评分 {session.scoringVersion} · 配置 {session.configVersion}
              {session.profile ? ` · ${profileLabel(session.profile)}` : ''}
            </p>
          </ReportDetails>

          {report?.disclaimer && <ReportDisclaimer>{report.disclaimer}</ReportDisclaimer>}
        </div>
      )}
    </ProductPage>
  )
}

export default function CognitiveResultEntry() {
  return <CognitiveSessionEntry><CognitiveResult /></CognitiveSessionEntry>
}
