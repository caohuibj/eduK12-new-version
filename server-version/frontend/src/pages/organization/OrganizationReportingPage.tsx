import { ReportingCohortBuilder } from './ReportingCohortBuilder'
import type { CohortOptions, CohortSelector } from '../../api/reporting'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  reportingApi,
  type PublishedReportingSpecSummary,
  type ReportingAnalysisKind,
  type ReportingArtifactProjection,
  type ReportingMetricProjection,
  type ReportingProjection,
  type ReportingResourceFamily,
  type ReportingSeriesDiscoveryItem,
  type ReportingSourceSummary,
  type ProtectedReportingSourceSummary,
} from '../../api/reporting'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

const RESOURCE_FAMILIES: ReportingResourceFamily[] = ['BUNDLE', 'SCALE', 'COGNITIVE', 'SITUATIONAL']
const LONGITUDINAL_KINDS: Array<Extract<ReportingAnalysisKind, 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'>> = ['REPEATED_COHORT', 'MATCHED_LONGITUDINAL']
const errorText = (value: unknown, fallback: string) => value instanceof Error && value.message ? value.message : fallback
const sourceKey = (source: Pick<ReportingSourceSummary, 'runId' | 'trackId'>) => `${source.runId}::${source.trackId}`
const formatTime = (value: string | null) => value ? new Date(value).toLocaleString() : '—'
const formatValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  ? String(value)
  : JSON.stringify(value)

function MetricCard({ metricId, metric }: { metricId: string; metric: ReportingMetricProjection | { state: 'present' | 'suppressed'; aggregations?: Record<string, unknown> } }) {
  if (metric.state === 'suppressed') {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><strong>{metricId}</strong><p className="mt-1 text-sm text-amber-900">SUPPRESSED · 隐私阈值未满足，服务端未返回统计值。</p></div>
  }
  const rich = metric as ReportingMetricProjection
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{metricId}</strong><span className="text-xs font-semibold text-emerald-700">AVAILABLE</span></div>
      {'validN' in rich && (rich.validN !== undefined || rich.missingN !== undefined) && <p className="mt-1 text-sm text-slate-600">valid N {rich.validN ?? '—'} · missing N {rich.missingN ?? '—'}</p>}
      {metric.aggregations && <dl className="mt-2 grid gap-1 text-sm">{Object.entries(metric.aggregations).map(([key, value]) => <div key={key} className="grid min-w-0 grid-cols-[minmax(7rem,auto)_1fr] gap-2"><dt className="font-medium text-slate-600">{key}</dt><dd className="break-words text-slate-900">{formatValue(value)}</dd></div>)}</dl>}
    </div>
  )
}

function Evidence({ level, limitations }: { level: string; limitations: string[] }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><strong>Scientific status · {level}</strong>{limitations.length > 0 ? <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1 text-sm text-slate-600">无额外 limitation。</p>}</div>
}

export function ProjectionPanel({ artifact }: { artifact: ReportingArtifactProjection }) {
  const projection: ReportingProjection = artifact.projection
  const suppressed = projection.state === 'suppressed'
  return (
    <section className="mt-8 min-w-0 break-words space-y-4" aria-labelledby="report-artifact-heading">
      <div><h2 id="report-artifact-heading" className="text-xl font-semibold text-slate-900">Artifact projection</h2><p className="mt-1 text-sm text-slate-600">Artifact {artifact.artifactId} · generated {formatTime(artifact.generatedAt)}。以下字段均为服务器安全投影。</p></div>
      {suppressed && <ProductStatus kind="warning" title="SUPPRESSED · 隐私保护已生效">服务端未返回受保护的统计内容；前端不会尝试从 source 或计数重新计算。</ProductStatus>}
      {!suppressed && <ProductStatus kind="success" title="AVAILABLE">服务端允许呈现当前 artifact projection。</ProductStatus>}

      {projection.kind === 'GROUP' && (
        <div className="space-y-4">
          {projection.evidence && <Evidence level={projection.evidence.level} limitations={projection.evidence.limitations} />}
          {projection.state === 'present' && <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-3"><span className="text-sm text-slate-500">Frozen eligible N</span><p className="text-2xl font-semibold">{projection.eligibleN ?? '—'}</p></div><div className="rounded-lg border border-slate-200 bg-white p-3"><span className="text-sm text-slate-500">Result contributor N</span><p className="text-2xl font-semibold">{projection.resultContributorN ?? '—'}</p></div></div>}
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">{Object.entries(projection.metrics ?? {}).map(([metricId, metric]) => <MetricCard key={metricId} metricId={metricId} metric={metric} />)}</div>
        </div>
      )}

      {projection.kind === 'REPEATED_COHORT' && (
        <div className="space-y-4">
          <ProductStatus kind="info" title="Repeated cohort · 非个体变化">{projection.limitations.join(' · ')}</ProductStatus>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">{projection.waves.map((wave) => <article key={wave.waveId} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{wave.waveKey} · wave {wave.ordinal}</strong><span className={wave.state === 'present' ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-amber-700'}>{wave.state === 'present' ? 'AVAILABLE' : 'SUPPRESSED'}</span></div>{wave.state === 'present' && <p className="mt-2 text-sm text-slate-600">eligible N {wave.eligibleN ?? '—'} · contributors {wave.resultContributorN ?? '—'}</p>}<div className="mt-3"><Evidence level={wave.evidence.level} limitations={wave.evidence.limitations} /></div><div className="mt-3 grid min-w-0 gap-2">{Object.entries(wave.metrics ?? {}).map(([metricId, metric]) => <MetricCard key={metricId} metricId={metricId} metric={metric} />)}</div></article>)}</div>
          <div className="space-y-3"><h3 className="font-semibold">Comparability decisions</h3>{projection.comparisons.map((pair) => <div key={`${pair.fromWaveId}-${pair.toWaveId}`} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-sm font-medium">{pair.fromWaveId} → {pair.toWaveId}</p><ul className="mt-2 space-y-1 text-sm text-slate-600">{Object.entries(pair.metrics).map(([metricId, decision]) => <li key={metricId}>{metricId}: {decision.level} · ops {decision.allowedOperations.join(', ') || 'none'}{decision.limitations.length ? ` · ${decision.limitations.join('; ')}` : ''}</li>)}</ul></div>)}</div>
        </div>
      )}

      {projection.kind === 'MATCHED_LONGITUDINAL' && (
        <div className="space-y-4">
          <Evidence level={projection.evidence.level} limitations={projection.evidence.limitations} />
          <div className="rounded-lg border border-slate-200 bg-white p-3"><strong>Matched mode · {projection.mode}</strong>{projection.state === 'present' && <p className="mt-1 text-sm text-slate-600">matched eligible N {projection.matchedEligibleN ?? '—'} · waves {projection.waveIds.join(', ')}</p>}</div>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">{Object.entries(projection.metrics ?? {}).map(([metricId, metric]) => <div key={metricId} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{metricId}</strong><span className={metric.state === 'present' ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-amber-700'}>{metric.state === 'present' ? 'AVAILABLE' : 'SUPPRESSED'}</span></div>{metric.state === 'present' && <><p className="mt-1 text-sm text-slate-600">{metric.countKind ?? 'case count'} · valid cases {metric.validCaseN ?? '—'}</p>{metric.waveMeans && <ul className="mt-2 text-sm text-slate-600">{metric.waveMeans.map((wave) => <li key={wave.waveId}>{wave.waveKey}: mean {wave.mean}</li>)}</ul>}{metric.comparisons && <ul className="mt-2 text-sm text-slate-600">{metric.comparisons.map((comparison) => <li key={`${comparison.fromWaveId}-${comparison.toWaveId}`}>{comparison.fromWaveId} → {comparison.toWaveId}: {comparison.comparability.level}{comparison.delta !== undefined ? ` · delta ${comparison.delta}` : ''}</li>)}</ul>}</>}</div>)}</div>
        </div>
      )}

      {projection.kind === 'PROTECTED_FEEDBACK' && (
        <div className="space-y-4">
          {artifact.evidence && <Evidence level={artifact.evidence.level} limitations={artifact.evidence.limitations} />}
          <ProductStatus kind="info" title="Protected feedback">{projection.limitations.join(' · ')}。该投影不包含 respondent identity 或 respondent count。</ProductStatus>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">{Object.entries(projection.metrics ?? {}).map(([metricId, metric]) => <MetricCard key={metricId} metricId={metricId} metric={metric} />)}</div>
        </div>
      )}
    </section>
  )
}

export default function OrganizationReportingPage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const { active, activeLoading, activeError, selectOrganization } = useOrganization()
  const context = active?.organization.id === organizationId ? active : null
  const [specs, setSpecs] = useState<PublishedReportingSpecSummary[]>([])
  const [sources, setSources] = useState<ReportingSourceSummary[]>([])
  const [protectedSources, setProtectedSources] = useState<ProtectedReportingSourceSummary[]>([])
  const [series, setSeries] = useState<ReportingSeriesDiscoveryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [artifact, setArtifact] = useState<ReportingArtifactProjection | null>(null)

  const [groupSpecId, setGroupSpecId] = useState('')
  const [groupSourceKey, setGroupSourceKey] = useState('')
  const [seriesKey, setSeriesKey] = useState('')
  const [seriesFamily, setSeriesFamily] = useState<ReportingResourceFamily>('BUNDLE')
  const [seriesResourceKey, setSeriesResourceKey] = useState('')
  const [waveSeriesId, setWaveSeriesId] = useState('')
  const [waveSourceKey, setWaveSourceKey] = useState('')
  const [waveKey, setWaveKey] = useState('')
  const [waveOrdinal, setWaveOrdinal] = useState('1')
  const [longitudinalKind, setLongitudinalKind] = useState<Extract<ReportingAnalysisKind, 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'>>('REPEATED_COHORT')
  const [longitudinalSeriesId, setLongitudinalSeriesId] = useState('')
  const [longitudinalSpecId, setLongitudinalSpecId] = useState('')
  const [selectedWaveKeys, setSelectedWaveKeys] = useState<string[]>([])
  const [matchedMode, setMatchedMode] = useState<'PAIRWISE' | 'FULL_CASE'>('FULL_CASE')
  const [protectedSpecId, setProtectedSpecId] = useState('')
  const [protectedSourceKey, setProtectedSourceKey] = useState('')
  const [cohortOptions, setCohortOptions] = useState<CohortOptions>({ classes: [], dimensions: [], labels: [] })
  const [cohortSelector, setCohortSelector] = useState<CohortSelector>({ schemaVersion: 2, combine: 'ALL', clauses: [] })
  const [cohortStrategy, setCohortStrategy] = useState<'WAVE_SPECIFIC' | 'BASELINE_FIXED'>('WAVE_SPECIFIC')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [resource, setResource] = useState('')
  const [nextSourcePage, setNextSourcePage] = useState<number | null>(null)
  const [artifactId, setArtifactId] = useState('')

  useEffect(() => {
    if (!organizationId || context || activeLoading) return
    void selectOrganization(organizationId)
  }, [organizationId, context, activeLoading, selectOrganization])

  const load = useCallback(async () => {
    if (!organizationId || !context) return
    setLoading(true)
    setArtifact(null)
    setLoadError(null)
    try {
      const [specPage, sourcePage, protectedPage, seriesPage, options] = await Promise.all([
        reportingApi.listSpecs(organizationId),
        reportingApi.listSources(organizationId),
        reportingApi.listProtectedSources(organizationId),
        reportingApi.listSeries(organizationId),
        reportingApi.cohortOptions(organizationId),
      ])
      setSpecs(specPage.list)
      setSources(sourcePage.list)
      setNextSourcePage(sourcePage.nextPage ?? null)
      setCohortOptions(options)
      setProtectedSources(protectedPage.list)
      setSeries(seriesPage.list)
      setGroupSpecId((current) => current || specPage.list.find((item) => item.analysisKind === 'GROUP')?.specId || '')
      setGroupSourceKey((current) => current || (sourcePage.list[0] ? sourceKey(sourcePage.list[0]) : ''))
      setWaveSeriesId((current) => current || seriesPage.list[0]?.seriesId || '')
      setWaveSourceKey((current) => current || (sourcePage.list[0] ? sourceKey(sourcePage.list[0]) : ''))
      setLongitudinalSeriesId((current) => current || seriesPage.list[0]?.seriesId || '')
      setLongitudinalSpecId((current) => current || specPage.list.find((item) => item.analysisKind === 'REPEATED_COHORT')?.specId || '')
      setProtectedSpecId((current) => current || specPage.list.find((item) => item.analysisKind === 'PROTECTED_FEEDBACK')?.specId || '')
      setProtectedSourceKey((current) => current || (protectedPage.list[0] ? `${sourceKey(protectedPage.list[0])}::${protectedPage.list[0].subject.userId}::${protectedPage.list[0].relationshipKind}::${protectedPage.list[0].perspective}` : ''))
    } catch (error) {
      setArtifact(null)
      setSpecs([])
      setSources([])
      setProtectedSources([])
      setSeries([])
      setLoadError(errorText(error, '当前账户无法进入 Reporting workspace'))
    } finally {
      setLoading(false)
    }
  }, [organizationId, context])

  useEffect(() => { void load() }, [load])

  const act = useCallback(async (successMessage: string, operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setArtifact(null)
    setActionError(null)
    setNotice(null)
    try {
      await operation()
      setNotice(successMessage)
    } catch (error) {
      setArtifact(null)
      setActionError(errorText(error, 'Reporting 操作失败'))
    } finally {
      setBusy(false)
    }
  }, [busy])

  const groupSpecs = useMemo(() => specs.filter((item) => item.analysisKind === 'GROUP'), [specs])
  const longitudinalSpecs = useMemo(() => specs.filter((item) => item.analysisKind === longitudinalKind), [specs, longitudinalKind])
  const protectedSpecs = useMemo(() => specs.filter((item) => item.analysisKind === 'PROTECTED_FEEDBACK'), [specs])
  const currentSeries = useMemo(() => series.find((item) => item.seriesId === longitudinalSeriesId) ?? null, [series, longitudinalSeriesId])

  useEffect(() => {
    const candidate = longitudinalSpecs[0]?.specId ?? ''
    if (!longitudinalSpecs.some((item) => item.specId === longitudinalSpecId)) setLongitudinalSpecId(candidate)
  }, [longitudinalSpecs, longitudinalSpecId])

  useEffect(() => {
    setSelectedWaveKeys((current) => current.filter((key) => currentSeries?.waves.some((wave) => wave.waveKey === key)))
  }, [currentSeries])

  const createSeries = async (event: FormEvent) => {
    event.preventDefault()
    if (!seriesKey.trim() || !seriesResourceKey.trim()) return
    await act('Series 已创建。', async () => {
      await reportingApi.createSeries(organizationId, { seriesKey: seriesKey.trim(), scope: { resourceFamily: seriesFamily, resourceKey: seriesResourceKey.trim() } })
      setSeriesKey('')
      await load()
    })
  }

  const bindWave = async (event: FormEvent) => {
    event.preventDefault()
    const source = sources.find((item) => sourceKey(item) === waveSourceKey)
    const ordinal = Number.parseInt(waveOrdinal, 10)
    if (!source || !waveSeriesId || !waveKey.trim() || !Number.isInteger(ordinal) || ordinal < 1) return
    await act('Wave 已绑定到 immutable cohort input。', async () => {
      await reportingApi.bindWave(organizationId, waveSeriesId, { waveKey: waveKey.trim(), ordinal, runId: source.runId, trackId: source.trackId })
      setWaveKey('')
      await load()
    })
  }

  const generateGroup = () => act('GROUP artifact 已生成或复用。', async () => {
    const source = sources.find((item) => sourceKey(item) === groupSourceKey)
    if (!source || !groupSpecId) throw new Error('请选择可用 source 和已发布 GROUP spec')
    setArtifact(await reportingApi.analyzeGroup(organizationId, { runId: source.runId, trackId: source.trackId, specId: groupSpecId, ...(cohortSelector.clauses.length ? { cohortSelector } : {}) }))
  })

  const generateLongitudinal = () => act(`${longitudinalKind} artifact 已生成或复用。`, async () => {
    if (!longitudinalSeriesId || !longitudinalSpecId || selectedWaveKeys.length < 2) throw new Error('请选择 Series、至少两个 Wave 和匹配的已发布 spec')
    const next = longitudinalKind === 'REPEATED_COHORT'
      ? await reportingApi.analyzeRepeated(organizationId, { seriesId: longitudinalSeriesId, waveKeys: selectedWaveKeys, specId: longitudinalSpecId })
      : await reportingApi.analyzeMatched(organizationId, { seriesId: longitudinalSeriesId, waveKeys: selectedWaveKeys, specId: longitudinalSpecId, mode: matchedMode })
    setArtifact(next)
  })

  const generateAutomatic = () => act('纵向报告已生成。', async () => {
    const chosen = sources.filter(s => selectedSources.includes(sourceKey(s)) && `${s.resource.family}/${s.resource.key}` === resource)
    if (longitudinalKind === 'MATCHED_LONGITUDINAL' && matchedMode === 'PAIRWISE' && chosen.length !== 2) throw new Error('配对分析请选两个时间点；三个及以上时间点请选择全部时间点匹配')
    if (chosen.length < 2 || !longitudinalSpecId) throw new Error('请选择至少两次测量和报告方案')
    setArtifact(await reportingApi.analyzeAutomatic(organizationId, { analysisKind: longitudinalKind,
      sources: chosen.map(({ runId, trackId }) => ({ runId, trackId })), specId: longitudinalSpecId,
      cohortSelector, cohortStrategy, ...(longitudinalKind === 'MATCHED_LONGITUDINAL' ? { mode: matchedMode } : {}) }))
  })
  const loadMoreSources = () => act('已加载更多测量。', async () => {
    if (!nextSourcePage) return
    const page = await reportingApi.listSources(organizationId, nextSourcePage)
    setSources(current => [...new Map([...current, ...page.list].map(s => [sourceKey(s), s])).values()])
    setNextSourcePage(page.nextPage ?? null)
  })

  const generateProtected = () => act('PROTECTED_FEEDBACK artifact 已生成或复用。', async () => {
    const source = protectedSources.find((item) => `${sourceKey(item)}::${item.subject.userId}::${item.relationshipKind}::${item.perspective}` === protectedSourceKey)
    if (!source || !protectedSpecId) throw new Error('请选择当前有权限的 protected source 与已发布 spec')
    setArtifact(await reportingApi.analyzeProtected(organizationId, {
      runId: source.runId,
      trackId: source.trackId,
      subjectUserId: source.subject.userId,
      relationshipKind: source.relationshipKind,
      perspective: source.perspective,
      specId: protectedSpecId,
    }))
  })

  const readArtifact = () => act('Artifact 已按当前权限重新读取。', async () => {
    if (!artifactId.trim()) throw new Error('请输入 artifact ID')
    setArtifact(await reportingApi.readArtifact(organizationId, artifactId.trim()))
  })

  if (activeLoading && !context) return <ProductPage><ProductStatus kind="pending" title="正在验证组织上下文">服务器正在重新确认当前 Organization authority。</ProductStatus></ProductPage>
  if (!context) return <ProductPage><ProductStatus kind="error" title="无法进入 Reporting" actions={<Link to="/">返回首页</Link>}>{activeError || '当前账户没有此组织的有效访问上下文。'}</ProductStatus></ProductPage>
  if (loading && specs.length === 0 && !loadError) return <ProductPage><ProductStatus kind="pending" title="正在加载 Reporting workspace">正在读取已发布 spec、授权 source 与 Series/Wave 摘要。</ProductStatus></ProductPage>
  if (loadError && specs.length === 0) return <ProductPage><ProductStatus kind="warning" title="Reporting workspace 不可用" actions={<Link to={`/organizations/${encodeURIComponent(organizationId)}`}>返回组织空间</Link>}>{loadError}</ProductStatus></ProductPage>

  return (
    <ProductPage>
      <PageHeader title="群体与纵向报告" description="选择分析人群与测量时间，查看单次群体表现或多次测量变化。" actions={<div className="flex gap-3"><Link to={`/organizations/${encodeURIComponent(organizationId)}`}>组织管理</Link>{context.access.canGovern && <Link to={`/organizations/${encodeURIComponent(organizationId)}/runs`}>Assessment Runs</Link>}</div>} />
      {loadError && <ProductStatus kind="warning" title="部分 discovery 刷新失败">{loadError}</ProductStatus>}
      {actionError && <ProductStatus kind="error" title="Reporting 操作失败" announce="assertive">{actionError}</ProductStatus>}
      {notice && <ProductStatus kind="success" title="Reporting 已更新" announce="polite">{notice}</ProductStatus>}

      <ReportingCohortBuilder options={cohortOptions} value={cohortSelector} onChange={setCohortSelector} />
      {nextSourcePage && <ProductButton disabled={busy} onClick={() => void loadMoreSources()}>加载更早的测量</ProductButton>}
      <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="自动纵向报告">
        <h2 className="text-xl font-semibold">Longitudinal 纵向报告</h2>
        <label className="grid gap-1">选择测量项目<select value={resource} onChange={e => { setResource(e.target.value); setSelectedSources([]) }}><option value="">请选择</option>{[...new Set(sources.map(s => `${s.resource.family}/${s.resource.key}`))].map(key => <option key={key}>{key}</option>)}</select></label>
        <fieldset><legend>选择至少两个时间点</legend>{sources.filter(s => `${s.resource.family}/${s.resource.key}` === resource).map(s => <label key={sourceKey(s)} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selectedSources.includes(sourceKey(s))} onChange={e => setSelectedSources(current => e.target.checked ? [...current, sourceKey(s)] : current.filter(k => k !== sourceKey(s)))} />{formatTime(s.publishedAt)} · {s.runName} · {s.resource.version}</label>)}</fieldset>
        <label className="grid gap-1">人群定义<select value={cohortStrategy} onChange={e => setCohortStrategy(e.target.value as typeof cohortStrategy)}><option value="WAVE_SPECIFIC">每次按当时标签／班级重新选人</option><option value="BASELINE_FIXED">固定第一次测量的人群并追踪</option></select></label>
        <label className="grid gap-1">分析方式<select value={longitudinalKind} onChange={e => setLongitudinalKind(e.target.value as typeof longitudinalKind)}><option value="REPEATED_COHORT">群体变化趋势（每次参与者可不同）</option><option value="MATCHED_LONGITUDINAL">同一被试变化</option></select></label>
        {longitudinalKind === 'MATCHED_LONGITUDINAL' && <label className="grid gap-1">匹配方式<select value={matchedMode} onChange={e => setMatchedMode(e.target.value as typeof matchedMode)}><option value="PAIRWISE">两个时间点配对（仅选两次）</option><option value="FULL_CASE">全部时间点均有测量</option></select></label>}
        <label className="grid gap-1">报告方案<select value={longitudinalSpecId} onChange={e => setLongitudinalSpecId(e.target.value)}><option value="">请选择</option>{longitudinalSpecs.map(spec => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version}</option>)}</select></label>
        <ProductButton variant="primary" disabled={busy || selectedSources.length < 2 || !longitudinalSpecId} onClick={() => void generateAutomatic()}>生成纵向报告</ProductButton>
      </section>

      <section className="mt-6 space-y-4" aria-labelledby="group-report-heading">
        <div><h2 id="group-report-heading" className="text-xl font-semibold">单次群体报告</h2><p className="mt-1 text-sm text-slate-600">选择一次测量，并使用上方的人群条件生成报告。</p></div>
        <div className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm font-medium">选择测量<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={groupSourceKey} onChange={(event) => setGroupSourceKey(event.target.value)}><option value="">请选择</option>{sources.map((source) => <option key={sourceKey(source)} value={sourceKey(source)}>{source.runName} · {source.resource.family}/{source.resource.key}@{source.resource.version}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-sm font-medium">报告方案（单次）<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={groupSpecId} onChange={(event) => setGroupSpecId(event.target.value)}><option value="">请选择</option>{groupSpecs.map((spec) => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version} · ceiling {spec.reportEvidenceCeiling}</option>)}</select></label>
          <div className="flex items-end md:col-span-2"><ProductButton variant="primary" disabled={busy || !groupSourceKey || !groupSpecId} onClick={() => void generateGroup()}>生成群体报告</ProductButton></div>
        </div>
      </section>

      <details className="mt-8"><summary>高级：手动管理历史报告系列</summary>
      <section className="mt-8 space-y-4" aria-labelledby="series-heading">
        <div><h2 id="series-heading" className="text-xl font-semibold">Longitudinal Series / Waves</h2><p className="mt-1 text-sm text-slate-600">Series scope 固定 resource family/key；Wave 绑定会冻结 cohort 与 authoritative input identity。</p></div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <form className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={createSeries}><h3 className="font-semibold">创建 Series</h3><label className="grid min-w-0 gap-1 text-sm font-medium">Series key<input className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={seriesKey} onChange={(event) => setSeriesKey(event.target.value)} /></label><label className="grid min-w-0 gap-1 text-sm font-medium">Resource family<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={seriesFamily} onChange={(event) => setSeriesFamily(event.target.value as ReportingResourceFamily)}>{RESOURCE_FAMILIES.map((family) => <option key={family}>{family}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Resource key<input className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={seriesResourceKey} onChange={(event) => setSeriesResourceKey(event.target.value)} /></label><ProductButton type="submit" disabled={busy || !seriesKey.trim() || !seriesResourceKey.trim()}>创建 Series</ProductButton></form>
          <form className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={bindWave}><h3 className="font-semibold">绑定 Wave</h3><label className="grid min-w-0 gap-1 text-sm font-medium">Series<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveSeriesId} onChange={(event) => setWaveSeriesId(event.target.value)}><option value="">请选择</option>{series.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.seriesKey} · {item.scope.resourceFamily}/{item.scope.resourceKey}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">选择测量<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveSourceKey} onChange={(event) => setWaveSourceKey(event.target.value)}><option value="">请选择</option>{sources.map((source) => <option key={sourceKey(source)} value={sourceKey(source)}>{source.runName} · {source.resource.family}/{source.resource.key}@{source.resource.version}</option>)}</select></label><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm font-medium">Wave key<input className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveKey} onChange={(event) => setWaveKey(event.target.value)} /></label><label className="grid min-w-0 gap-1 text-sm font-medium">Ordinal<input type="number" min="1" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveOrdinal} onChange={(event) => setWaveOrdinal(event.target.value)} /></label></div><ProductButton type="submit" disabled={busy || !waveSeriesId || !waveSourceKey || !waveKey.trim()}>绑定 Wave</ProductButton></form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="grid min-w-0 gap-3 lg:grid-cols-3"><label className="grid min-w-0 gap-1 text-sm font-medium">Analysis kind<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={longitudinalKind} onChange={(event) => setLongitudinalKind(event.target.value as typeof longitudinalKind)}>{LONGITUDINAL_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Series<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={longitudinalSeriesId} onChange={(event) => { setLongitudinalSeriesId(event.target.value); setSelectedWaveKeys([]) }}><option value="">请选择</option>{series.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.seriesKey} · waves {item.waveCount}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Published spec<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={longitudinalSpecId} onChange={(event) => setLongitudinalSpecId(event.target.value)}><option value="">请选择</option>{longitudinalSpecs.map((spec) => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version}</option>)}</select></label></div>{longitudinalKind === 'MATCHED_LONGITUDINAL' && <label className="mt-3 grid min-w-0 max-w-xs gap-1 text-sm font-medium">Matched mode<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={matchedMode} onChange={(event) => setMatchedMode(event.target.value as typeof matchedMode)}><option>PAIRWISE</option><option>FULL_CASE</option></select></label>}<fieldset className="mt-4"><legend className="text-sm font-medium">选择至少两个 Wave</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{currentSeries?.waves.map((wave) => <label key={wave.waveId} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3"><input type="checkbox" checked={selectedWaveKeys.includes(wave.waveKey)} onChange={(event) => setSelectedWaveKeys((current) => event.target.checked ? [...current, wave.waveKey] : current.filter((key) => key !== wave.waveKey))} /><span>{wave.waveKey} · ordinal {wave.ordinal}</span></label>)}</div>{currentSeries?.wavesTruncated && <p className="mt-2 text-sm text-amber-700">此 Series 的 discovery wave 列表已截断；需要更老 Wave 时应增加后端分页，而不是在客户端猜测。</p>}</fieldset><div className="mt-4"><ProductButton variant="primary" disabled={busy || selectedWaveKeys.length < 2 || !longitudinalSpecId} onClick={() => void generateLongitudinal()}>生成 {longitudinalKind}</ProductButton></div></div>
      </section>

      </details>
      <section className="mt-8 space-y-4" aria-labelledby="protected-heading">
        <div><h2 id="protected-heading" className="text-xl font-semibold">Protected feedback</h2><p className="mt-1 text-sm text-slate-600">Source discovery 已按 subject-scoped manager authority 过滤，只暴露 frozen subject/source identity，不暴露 respondent identities/counts。</p></div>
        <div className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm font-medium">Protected source<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={protectedSourceKey} onChange={(event) => setProtectedSourceKey(event.target.value)}><option value="">请选择</option>{protectedSources.map((source) => { const key = `${sourceKey(source)}::${source.subject.userId}::${source.relationshipKind}::${source.perspective}`; return <option key={key} value={key}>{source.runName} · subject {source.subject.userId} · {source.relationshipKind}/{source.perspective}</option> })}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Published protected spec<select className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={protectedSpecId} onChange={(event) => setProtectedSpecId(event.target.value)}><option value="">请选择</option>{protectedSpecs.map((spec) => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version}</option>)}</select></label><div className="flex items-end md:col-span-2"><ProductButton variant="primary" disabled={busy || !protectedSourceKey || !protectedSpecId} onClick={() => void generateProtected()}>生成 Protected</ProductButton></div></div>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="artifact-read-heading"><div><h2 id="artifact-read-heading" className="text-xl font-semibold">读取 immutable artifact</h2><p className="mt-1 text-sm text-slate-600">每次读取都会重新执行当前 authorization；历史 artifact ID 本身不授予访问权。</p></div><div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row"><input className="min-h-11 min-w-0 w-full flex-1 rounded-lg border border-slate-300 px-3" value={artifactId} onChange={(event) => setArtifactId(event.target.value)} placeholder="artifact UUID" /><ProductButton disabled={busy || !artifactId.trim()} onClick={() => void readArtifact()}>读取 artifact</ProductButton></div></section>

      {artifact && <ProjectionPanel artifact={artifact} />}
    </ProductPage>
  )
}
