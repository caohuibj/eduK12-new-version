import {
  aggregationLabel,
  limitationLabel,
  comparabilityLabel,
  operationLabel,
  waveLabel,
  measurementLabel,
  resourceLabel,
  evidenceLevelLabel,
  matchedModeLabel,
  countKindLabel,
} from './reportingLabels'
import { IndividualLongitudinalBuilder } from './IndividualLongitudinalBuilder'
import { ReportingCohortBuilder } from './ReportingCohortBuilder'
import type { CohortOptions, CohortSelector } from '../../api/reporting'
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
import {
  ReportCoreSummary,
  ReportDetails,
  ReportDisclaimer,
  ReportMetric,
  ReportMetricGrid,
  ReportSection,
} from '../../modules/reporting/ReportPrimitives'
import { ReportTrendChart } from '../../modules/reporting/ReportTrendChart'
import { toIndividualTrend, toMatchedTrend, toRepeatedTrend } from '../../modules/reporting/longitudinalVisualization'

const RESOURCE_FAMILIES: ReportingResourceFamily[] = ['BUNDLE', 'SCALE', 'COGNITIVE', 'SITUATIONAL']
const LONGITUDINAL_KINDS: Array<Extract<ReportingAnalysisKind, 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'>> = ['REPEATED_COHORT', 'MATCHED_LONGITUDINAL']
const errorText = (value: unknown, fallback: string) => value instanceof Error && value.message ? value.message : fallback
const sourceKey = (source: Pick<ReportingSourceSummary, 'runId' | 'trackId'>) => `${source.runId}::${source.trackId}`
const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '—'
const formatValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  ? String(value)
  : JSON.stringify(value)

function ReportDataList({ entries, ariaLabel }: { entries: Array<[ReactNode, ReactNode]>; ariaLabel?: string }) {
  return (
    <dl className="report-data-list" aria-label={ariaLabel}>
      {entries.map(([label, value], index) => (
        <div key={index}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Evidence({ level, limitations }: { level: string; limitations: string[] }) {
  return (
    <ReportDetails title={`证据与解释边界 · ${evidenceLevelLabel(level)}`}>
      {limitations.length > 0
        ? <ul className="report-detail-list">{limitations.map((item) => <li key={item}>{limitationLabel(item)}</li>)}</ul>
        : <p>当前投影没有额外的解释限制。</p>}
    </ReportDetails>
  )
}

function MetricCard({
  metricId,
  metric,
}: {
  metricId: string
  metric: ReportingMetricProjection | {
    state: 'present' | 'suppressed'
    aggregations?: Record<string, unknown>
    validN?: number
    missingN?: number
  }
}) {
  if (metric.state === 'suppressed') {
    return (
      <ReportMetric
        label={metricId}
        value="隐私保护"
        description="当前人数或隐私阈值未满足，因此不展示该指标的统计值。"
      />
    )
  }
  const rich = metric as ReportingMetricProjection
  const countDescription = 'validN' in rich && (rich.validN !== undefined || rich.missingN !== undefined)
    ? `有效人数 ${rich.validN ?? '—'} · 缺失人数 ${rich.missingN ?? '—'}`
    : undefined
  const aggregationEntries = Object.entries(metric.aggregations ?? {}).map(([key, value]) => (
    [aggregationLabel(key), formatValue(value)] as [ReactNode, ReactNode]
  ))
  return (
    <ReportMetric
      label={metricId}
      value="结果可查看"
      description={countDescription}
      meta={aggregationEntries.length > 0
        ? <ReportDataList entries={aggregationEntries} ariaLabel={`${metricId} 统计摘要`} />
        : undefined}
    />
  )
}

function ComparisonList({
  pairs,
}: {
  pairs: Array<{ label: ReactNode; details: ReactNode }>
}) {
  return (
    <div className="report-comparison-list">
      {pairs.map((pair, index) => (
        <article className="report-comparison" key={index}>
          <h4>{pair.label}</h4>
          <div>{pair.details}</div>
        </article>
      ))}
    </div>
  )
}

export function ProjectionPanel({ artifact }: { artifact: ReportingArtifactProjection }) {
  const projection: ReportingProjection = artifact.projection
  const suppressed = projection.state === 'suppressed'
  const waveName = (id: string) => {
    if (projection.kind === 'REPEATED_COHORT') {
      const wave = projection.waves.find(w => w.waveId === id)
      return wave ? waveLabel(wave.ordinal, wave.waveKey) : '测量时间点'
    }
    if (projection.kind === 'MATCHED_LONGITUDINAL') {
      const index = projection.waveIds.indexOf(id)
      const wave = Object.values(projection.metrics ?? {}).flatMap(m => m.waveMeans ?? []).find(w => w.waveId === id)
      return index >= 0 ? waveLabel(index + 1, wave?.waveKey) : '测量时间点'
    }
    return '测量时间点'
  }

  const trendModels = projection.kind === 'MATCHED_LONGITUDINAL'
    ? Object.keys(projection.metrics ?? {}).map((metricId) => toMatchedTrend(projection, metricId, waveLabel))
    : projection.kind === 'REPEATED_COHORT'
      ? Array.from(new Set(projection.waves.flatMap((wave) => Object.keys(wave.metrics ?? {}))))
        .map((metricId) => toRepeatedTrend(projection, metricId, waveLabel))
      : projection.kind === 'INDIVIDUAL_LONGITUDINAL'
        ? Array.from(new Set(projection.waves.flatMap((wave) => Object.keys(wave.metrics))))
          .map((metricId) => toIndividualTrend(projection, metricId, waveLabel))
        : []
  const visibleTrendModels = trendModels.filter((model) => model.state !== 'unavailable')

  return (
    <section className="hui-report organization-report-result mt-8 min-w-0 break-words" aria-labelledby="report-artifact-heading">
      <div className="report-body">
        <ReportCoreSummary label="报告概览">
          <div>
            <h2 id="report-artifact-heading" className="organization-report-result__title">报告结果</h2>
            <p className="organization-report-result__meta">生成时间：{formatTime(artifact.generatedAt)}</p>
            <ReportDetails title="报告记录编号">
              <p>Artifact {artifact.artifactId}</p>
            </ReportDetails>
            <p className="organization-report-result__artifact-print">Artifact {artifact.artifactId}</p>
          </div>
        </ReportCoreSummary>

        {suppressed ? (
          <ProductStatus kind="warning" title="隐私保护已生效">
            服务端未返回受保护的统计内容；前端不会尝试从来源、计数或相邻时间点重新推算。
          </ProductStatus>
        ) : (
          <ProductStatus kind="success" title="报告可以阅读">
            以下内容已经通过当前访问权限、报告方案与隐私规则检查。
          </ProductStatus>
        )}

        {visibleTrendModels.length > 0 && (
          <ReportSection
            title="纵向趋势"
            eyebrow="纵向阅读"
            description="图表只展示服务端已经投影的数值、可比性与变化量。不可比较或受隐私保护的区段保持断开。"
          >
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              {visibleTrendModels.map((model) => (
                <ReportTrendChart
                  key={model.metricId}
                  model={model}
                  title={model.metricId}
                  valueLabel={projection.kind === 'INDIVIDUAL_LONGITUDINAL' ? '服务端投影值' : '服务端投影均值'}
                />
              ))}
            </div>
          </ReportSection>
        )}

        {projection.kind === 'GROUP' && (
          <>
            {projection.state === 'present' && (
              <ReportSection title="群体概览" eyebrow="本次测量" description="人数来自当前报告投影；前端不重新计算参与人群。">
                <ReportMetricGrid>
                  <ReportMetric label="所选人群人数" value={projection.eligibleN ?? '—'} />
                  <ReportMetric label="有效结果人数" value={projection.resultContributorN ?? '—'} />
                </ReportMetricGrid>
              </ReportSection>
            )}
            <ReportSection title="指标结果" eyebrow="群体指标">
              <ReportMetricGrid>
                {Object.entries(projection.metrics ?? {}).map(([metricId, metric]) => (
                  <MetricCard key={metricId} metricId={metricId} metric={metric} />
                ))}
              </ReportMetricGrid>
            </ReportSection>
            {projection.evidence && <Evidence level={projection.evidence.level} limitations={projection.evidence.limitations} />}
          </>
        )}

        {projection.kind === 'REPEATED_COHORT' && (
          <>
            <ReportCoreSummary label="群体趋势说明">
              <p>这里比较的是各次测量中的群体结果；参与者可以不同，因此不能把群体趋势解释为同一个人的变化。</p>
            </ReportCoreSummary>

            <ReportSection title="各次测量" eyebrow="时间点">
              <div className="organization-report-wave-grid">
                {projection.waves.map((wave) => (
                  <ReportSection
                    key={wave.waveId}
                    title={waveLabel(wave.ordinal, wave.waveKey)}
                    eyebrow={wave.state === 'present' ? '结果可查看' : '隐私保护'}
                    headingLevel={3}
                    className="organization-report-wave"
                  >
                    {wave.state === 'present' && (
                      <ReportMetricGrid>
                        <ReportMetric label="所选人数" value={wave.eligibleN ?? '—'} />
                        <ReportMetric label="有效结果人数" value={wave.resultContributorN ?? '—'} />
                      </ReportMetricGrid>
                    )}
                    <div className="organization-report-wave__metrics">
                      <ReportMetricGrid>
                        {Object.entries(wave.metrics ?? {}).map(([metricId, metric]) => (
                          <MetricCard key={metricId} metricId={metricId} metric={metric} />
                        ))}
                      </ReportMetricGrid>
                    </div>
                    <Evidence level={wave.evidence.level} limitations={wave.evidence.limitations} />
                  </ReportSection>
                ))}
              </div>
            </ReportSection>

            <ReportSection title="时间点可比性" eyebrow="比较边界" description="只有服务端明确允许的操作才可用于跨时间解释。">
              <ComparisonList pairs={projection.comparisons.map((pair) => ({
                label: <>{waveName(pair.fromWaveId)} → {waveName(pair.toWaveId)}</>,
                details: (
                  <ul className="report-detail-list">
                    {Object.entries(pair.metrics).map(([metricId, decision]) => (
                      <li key={metricId}>
                        <strong>{metricId}</strong>：{comparabilityLabel(decision.level)}
                        {' · '}
                        {decision.allowedOperations.map(operationLabel).join('、') || '不允许比较计算'}
                        {decision.limitations.length ? ` · ${decision.limitations.map(limitationLabel).join('；')}` : ''}
                      </li>
                    ))}
                  </ul>
                ),
              }))} />
            </ReportSection>

            <ReportDisclaimer>
              {projection.limitations.map(limitationLabel).join(' · ') || '群体趋势仅用于描述各次测量，不用于诊断或推断因果。'}
            </ReportDisclaimer>
          </>
        )}

        {projection.kind === 'MATCHED_LONGITUDINAL' && (
          <>
            <ReportSection title="匹配概览" eyebrow="同一被试变化">
              <ReportMetricGrid>
                <ReportMetric label="匹配方式" value={matchedModeLabel(projection.mode)} />
                <ReportMetric label="匹配人数" value={projection.state === 'present' ? projection.matchedEligibleN ?? '—' : '隐私保护'} />
                <ReportMetric label="测量次数" value={projection.waveIds.length} />
              </ReportMetricGrid>
            </ReportSection>

            <ReportSection title="指标变化" eyebrow="匹配结果">
              <div className="organization-report-matched-grid">
                {Object.entries(projection.metrics ?? {}).map(([metricId, metric]) => (
                  <ReportSection
                    key={metricId}
                    title={metricId}
                    eyebrow={metric.state === 'present' ? '结果可查看' : '隐私保护'}
                    headingLevel={3}
                    className="organization-report-matched-metric"
                  >
                    {metric.state === 'present' ? (
                      <>
                        <p className="organization-report-result__supporting">
                          {countKindLabel(metric.countKind)} · 有效人数 {metric.validCaseN ?? '—'}
                        </p>
                        {metric.waveMeans?.length ? (
                          <ReportDataList
                            ariaLabel={`${metricId} 各次测量均值`}
                            entries={metric.waveMeans.map((wave) => [waveName(wave.waveId), `均值 ${wave.mean}`])}
                          />
                        ) : null}
                        {metric.comparisons?.length ? (
                          <ComparisonList pairs={metric.comparisons.map((comparison) => ({
                            label: <>{waveName(comparison.fromWaveId)} → {waveName(comparison.toWaveId)}</>,
                            details: (
                              <p>
                                {comparabilityLabel(comparison.comparability.level)}
                                {comparison.comparability.allowedOperations.includes('NUMERIC_DELTA') && comparison.delta !== undefined
                                  ? ` · 变化量 ${comparison.delta}`
                                  : ''}
                              </p>
                            ),
                          }))} />
                        ) : null}
                      </>
                    ) : (
                      <p className="organization-report-result__supporting">当前隐私阈值未满足，因此不展示该指标的纵向统计。</p>
                    )}
                  </ReportSection>
                ))}
              </div>
            </ReportSection>
            <Evidence level={projection.evidence.level} limitations={projection.evidence.limitations} />
          </>
        )}

        {projection.kind === 'INDIVIDUAL_LONGITUDINAL' && (
          <>
            <ReportCoreSummary label="个人纵向说明">
              <p>以下内容用于描述同一被试在多次测量中的结果变化，不用于诊断，也不能据此推断变化原因。</p>
            </ReportCoreSummary>

            <ReportSection title="各次测量" eyebrow="个人时间点">
              <div className="organization-report-wave-grid">
                {projection.waves.map((wave) => (
                  <ReportSection
                    key={wave.waveId}
                    title={waveLabel(wave.ordinal, wave.waveKey)}
                    eyebrow="测量结果"
                    headingLevel={3}
                    className="organization-report-wave"
                  >
                    <ReportMetricGrid>
                      {Object.entries(wave.metrics).map(([id, metric]) => (
                        <ReportMetric
                          key={id}
                          label={id}
                          value={metric.state === 'present' ? metric.value : '暂不可解释'}
                          description={metric.state === 'present' ? undefined : '未完成、缺失或质量不足'}
                        />
                      ))}
                    </ReportMetricGrid>
                    <Evidence level={wave.evidence.level} limitations={wave.evidence.limitations} />
                  </ReportSection>
                ))}
              </div>
            </ReportSection>

            <ReportSection title="相邻时间点比较" eyebrow="可比性">
              <ComparisonList pairs={projection.comparisons.map((pair, index) => ({
                label: <>第 {index + 1} 次测量 → 第 {index + 2} 次测量</>,
                details: (
                  <ul className="report-detail-list">
                    {Object.entries(pair.metrics).map(([id, metric]) => (
                      <li key={id}>
                        <strong>{id}</strong>：{comparabilityLabel(metric.comparability.level)}
                        {' · '}
                        {metric.comparability.allowedOperations.includes('NUMERIC_DELTA') && metric.delta !== undefined
                          ? `变化量 ${metric.delta}`
                          : '未提供变化量'}
                      </li>
                    ))}
                  </ul>
                ),
              }))} />
            </ReportSection>

            <ReportDisclaimer>用于描述测量变化，不用于诊断或推断因果。</ReportDisclaimer>
          </>
        )}

        {projection.kind === 'PROTECTED_FEEDBACK' && (
          <>
            <ReportCoreSummary label="受保护反馈">
              <p>该结果仅在当前授权关系内提供，不展示被反馈者身份或参与人数等受保护信息。</p>
            </ReportCoreSummary>
            <ReportSection title="反馈指标" eyebrow="授权结果">
              <ReportMetricGrid>
                {Object.entries(projection.metrics ?? {}).map(([metricId, metric]) => (
                  <MetricCard key={metricId} metricId={metricId} metric={metric} />
                ))}
              </ReportMetricGrid>
            </ReportSection>
            {artifact.evidence && <Evidence level={artifact.evidence.level} limitations={artifact.evidence.limitations} />}
            <ReportDisclaimer>{projection.limitations.map(limitationLabel).join(' · ')}</ReportDisclaimer>
          </>
        )}
      </div>
    </section>
  )
}

export default function OrganizationReportingPage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const { active } = useOrganization()
  return <ReportingWorkspace key={organizationId + JSON.stringify(active?.access)} />
}

function ReportingWorkspace() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const { active, activeLoading, activeError, selectOrganization } = useOrganization()
  const context = active?.organization.id === organizationId ? active : null
  const [specs, setSpecs] = useState<PublishedReportingSpecSummary[]>([])
  const [sources, setSources] = useState<ReportingSourceSummary[]>([])
  const [protectedSources, setProtectedSources] = useState<ProtectedReportingSourceSummary[]>([])
  const [series, setSeries] = useState<ReportingSeriesDiscoveryItem[]>([])
  const [protectedLoaded, setProtectedLoaded] = useState(false)
  const [seriesLoaded, setSeriesLoaded] = useState(false)
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
    setArtifact(null)
    setNotice(null)
  }, [cohortSelector, cohortStrategy, selectedSources, resource, groupSourceKey, groupSpecId,
    longitudinalKind, longitudinalSpecId, matchedMode, longitudinalSeriesId, selectedWaveKeys,
    protectedSourceKey, protectedSpecId])

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
      const [specPage, sourcePage, options] = await Promise.all([
        reportingApi.listSpecs(organizationId),
        reportingApi.listSources(organizationId),
        reportingApi.cohortOptions(organizationId),
      ])
      setSpecs(specPage.list)
      setSources(sourcePage.list)
      setNextSourcePage(sourcePage.nextPage ?? null)
      setCohortOptions(options)
      setGroupSpecId((current) => current || specPage.list.find((item) => item.analysisKind === 'GROUP')?.specId || '')
      setGroupSourceKey((current) => current || (sourcePage.list[0] ? sourceKey(sourcePage.list[0]) : ''))
      setWaveSourceKey((current) => current || (sourcePage.list[0] ? sourceKey(sourcePage.list[0]) : ''))
      setLongitudinalSpecId((current) => current || specPage.list.find((item) => item.analysisKind === 'REPEATED_COHORT')?.specId || '')
      setProtectedSpecId((current) => current || specPage.list.find((item) => item.analysisKind === 'PROTECTED_FEEDBACK')?.specId || '')
    } catch (error) {
      setArtifact(null)
      setSpecs([])
      setSources([])
      setProtectedSources([])
      setSeries([])
      setProtectedLoaded(false)
      setSeriesLoaded(false)
      setLoadError(errorText(error, '当前账户无法进入 报告工作区'))
    } finally {
      setLoading(false)
    }
  }, [organizationId, context])

  const loadSeriesDiscovery = useCallback(async (force = false) => {
    if (!organizationId || !context || (seriesLoaded && !force)) return
    try {
      const page = await reportingApi.listSeries(organizationId)
      setSeries(page.list)
      setSeriesLoaded(true)
      setWaveSeriesId((current) => page.list.some((item) => item.seriesId === current) ? current : (page.list[0]?.seriesId ?? ''))
      setLongitudinalSeriesId((current) => page.list.some((item) => item.seriesId === current) ? current : (page.list[0]?.seriesId ?? ''))
    } catch (error) {
      setSeries([])
      setSeriesLoaded(false)
      setLoadError(errorText(error, '历史报告系列读取失败'))
    }
  }, [organizationId, context, seriesLoaded])

  const loadProtectedDiscovery = useCallback(async (force = false) => {
    if (!organizationId || !context || (protectedLoaded && !force)) return
    try {
      const page = await reportingApi.listProtectedSources(organizationId)
      setProtectedSources(page.list)
      setProtectedLoaded(true)
      setProtectedSourceKey((current) => {
        const available = page.list.map((item) => `${sourceKey(item)}::${item.subject.userId}::${item.relationshipKind}::${item.perspective}`)
        return available.includes(current) ? current : (available[0] ?? '')
      })
    } catch (error) {
      setProtectedSources([])
      setProtectedLoaded(false)
      setLoadError(errorText(error, '受保护反馈来源读取失败'))
    }
  }, [organizationId, context, protectedLoaded])

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
      await loadSeriesDiscovery(true)
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
      await loadSeriesDiscovery(true)
    })
  }

  const generateGroup = () => act('群体报告已生成。', async () => {
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

  const readArtifact = () => act('历史报告已按当前权限重新读取。', async () => {
    if (!artifactId.trim()) throw new Error('请输入 artifact ID')
    setArtifact(await reportingApi.readArtifact(organizationId, artifactId.trim()))
  })

  if (activeLoading && !context) return <ProductPage width="management"><ProductStatus kind="pending" title="正在验证组织上下文">服务器正在重新确认当前 Organization authority。</ProductStatus></ProductPage>
  if (!context) return <ProductPage width="management"><ProductStatus kind="error" title="无法进入报告分析" actions={<Link to="/">返回首页</Link>}>{activeError || '当前账户没有此组织的有效访问上下文。'}</ProductStatus></ProductPage>
  if (loading && specs.length === 0 && !loadError) return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载 报告工作区">正在读取报告方案和可用测量。</ProductStatus></ProductPage>
  if (loadError && specs.length === 0) return <ProductPage width="management"><ProductStatus kind="warning" title="报告工作区 不可用" actions={<Link to={`/organizations/${encodeURIComponent(organizationId)}`}>返回组织空间</Link>}>{loadError}</ProductStatus><IndividualLongitudinalBuilder key={organizationId + JSON.stringify(context.access)} organizationId={organizationId} /></ProductPage>

  return (
    <ProductPage width="management" className="organization-reporting-workspace">
      <PageHeader title="群体与纵向报告" description="选择分析人群与测量时间，查看单次群体表现或多次测量变化。" actions={<div className="organization-reporting-header-actions"><Link to={`/organizations/${encodeURIComponent(organizationId)}`}>组织管理</Link>{context.access.canGovern && <Link to={`/organizations/${encodeURIComponent(organizationId)}/runs`}>测评批次</Link>}</div>} />
      {loadError && <ProductStatus kind="warning" title="部分测量列表刷新失败">{loadError}</ProductStatus>}
      {actionError && <ProductStatus kind="error" title="报告分析操作失败" announce="assertive">{actionError}</ProductStatus>}
      {notice && <ProductStatus kind="success" title="报告分析已更新" announce="polite">{notice}</ProductStatus>}

      <IndividualLongitudinalBuilder key={organizationId + JSON.stringify(context.access)} organizationId={organizationId} />
      <fieldset disabled={busy} className="min-w-0">
      <ReportingCohortBuilder organizationId={organizationId} options={cohortOptions} value={cohortSelector} onChange={setCohortSelector} />
      {nextSourcePage && <ProductButton disabled={busy} onClick={() => void loadMoreSources()}>加载更早的测量</ProductButton>}
      <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="自动纵向报告">
        <h2 className="text-xl font-semibold">群体纵向报告</h2>
        <label className="grid gap-1">选择测量项目<select aria-label="选择测量项目" value={resource} onChange={e => { setResource(e.target.value); setSelectedSources([]) }}><option value="">请选择</option>{[...new Set(sources.map(s => `${s.resource.family}/${s.resource.key}`))].map(key => <option key={key} value={key}>{resourceLabel(sources,key)}</option>)}</select></label>
        <fieldset><legend>选择至少两个时间点</legend>{sources.filter(s => `${s.resource.family}/${s.resource.key}` === resource).map(s => <label key={sourceKey(s)} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selectedSources.includes(sourceKey(s))} onChange={e => setSelectedSources(current => e.target.checked ? [...current, sourceKey(s)] : current.filter(k => k !== sourceKey(s)))} />{formatTime(s.publishedAt)} · {s.runName} · {s.resource.version}</label>)}</fieldset>
        <label className="grid gap-1">人群定义<select aria-label="人群定义" value={cohortStrategy} onChange={e => setCohortStrategy(e.target.value as typeof cohortStrategy)}><option value="WAVE_SPECIFIC">每次按当时标签／班级重新选人</option><option value="BASELINE_FIXED">固定第一次测量的人群并追踪</option></select></label>
        <label className="grid gap-1">分析方式<select aria-label="分析方式" value={longitudinalKind} onChange={e => setLongitudinalKind(e.target.value as typeof longitudinalKind)}><option value="REPEATED_COHORT">群体变化趋势（每次参与者可不同）</option><option value="MATCHED_LONGITUDINAL">同一被试变化</option></select></label>
        {longitudinalKind === 'MATCHED_LONGITUDINAL' && <label className="grid gap-1">匹配方式<select aria-label="匹配方式" value={matchedMode} onChange={e => setMatchedMode(e.target.value as typeof matchedMode)}><option value="PAIRWISE">两个时间点配对（仅选两次）</option><option value="FULL_CASE">全部时间点均有测量</option></select></label>}
        <label className="grid gap-1">报告方案<select aria-label="报告方案" value={longitudinalSpecId} onChange={e => setLongitudinalSpecId(e.target.value)}><option value="">请选择</option>{longitudinalSpecs.map(spec => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version}</option>)}</select></label>
        <ProductButton variant="primary" disabled={busy || selectedSources.length < 2 || !longitudinalSpecId} onClick={() => void generateAutomatic()}>生成群体纵向报告</ProductButton>
      </section>

      <section className="mt-6 space-y-4" aria-labelledby="group-report-heading">
        <div><h2 id="group-report-heading" className="text-xl font-semibold">单次群体报告</h2><p className="mt-1 text-sm text-slate-600">选择一次测量，并使用上方的人群条件生成报告。</p></div>
        <div className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm font-medium">选择测量<select aria-label="选择测量" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={groupSourceKey} onChange={(event) => setGroupSourceKey(event.target.value)}><option value="">请选择</option>{sources.map((source) => <option key={sourceKey(source)} value={sourceKey(source)}>{source.runName} · {measurementLabel(source)} · 版本 {source.resource.version}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-sm font-medium">报告方案（单次）<select aria-label="报告方案（单次）" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={groupSpecId} onChange={(event) => setGroupSpecId(event.target.value)}><option value="">请选择</option>{groupSpecs.map((spec) => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version}</option>)}</select></label>
          <div className="flex items-end md:col-span-2"><ProductButton variant="primary" disabled={busy || !groupSourceKey || !groupSpecId} onClick={() => void generateGroup()}>生成单次群体报告</ProductButton></div>
        </div>
      </section>

      <details className="mt-8" onToggle={(event) => { if (event.currentTarget.open) void loadSeriesDiscovery() }}><summary>高级设置：历史报告系列与时间点</summary>
      <section className="mt-8 space-y-4" aria-labelledby="series-heading">
        <div><h2 id="series-heading" className="text-xl font-semibold">历史报告系列 / 时间点</h2><p className="mt-1 text-sm text-slate-600">Series scope 固定 resource family/key；Wave 绑定会冻结 cohort 与 authoritative input identity。</p></div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <form className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={createSeries}><h3 className="font-semibold">创建报告系列</h3><label className="grid min-w-0 gap-1 text-sm font-medium">Series key<input className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={seriesKey} onChange={(event) => setSeriesKey(event.target.value)} /></label><label className="grid min-w-0 gap-1 text-sm font-medium">Resource family<select aria-label="Resource family" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={seriesFamily} onChange={(event) => setSeriesFamily(event.target.value as ReportingResourceFamily)}>{RESOURCE_FAMILIES.map((family) => <option key={family}>{family}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Resource key<input className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={seriesResourceKey} onChange={(event) => setSeriesResourceKey(event.target.value)} /></label><ProductButton type="submit" disabled={busy || !seriesKey.trim() || !seriesResourceKey.trim()}>创建 Series</ProductButton></form>
          <form className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={bindWave}><h3 className="font-semibold">绑定时间点</h3><label className="grid min-w-0 gap-1 text-sm font-medium">Series<select aria-label="Series" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveSeriesId} onChange={(event) => setWaveSeriesId(event.target.value)}><option value="">请选择</option>{series.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.seriesKey} · {item.scope.resourceFamily}/{item.scope.resourceKey}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">选择测量<select aria-label="选择测量" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveSourceKey} onChange={(event) => setWaveSourceKey(event.target.value)}><option value="">请选择</option>{sources.map((source) => <option key={sourceKey(source)} value={sourceKey(source)}>{source.runName} · {measurementLabel(source)} · 版本 {source.resource.version}</option>)}</select></label><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm font-medium">Wave key<input className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveKey} onChange={(event) => setWaveKey(event.target.value)} /></label><label className="grid min-w-0 gap-1 text-sm font-medium">Ordinal<input type="number" min="1" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={waveOrdinal} onChange={(event) => setWaveOrdinal(event.target.value)} /></label></div><ProductButton type="submit" disabled={busy || !waveSeriesId || !waveSourceKey || !waveKey.trim()}>绑定 Wave</ProductButton></form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="grid min-w-0 gap-3 lg:grid-cols-3"><label className="grid min-w-0 gap-1 text-sm font-medium">Analysis kind<select aria-label="Analysis kind" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={longitudinalKind} onChange={(event) => setLongitudinalKind(event.target.value as typeof longitudinalKind)}>{LONGITUDINAL_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Series<select aria-label="Series" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={longitudinalSeriesId} onChange={(event) => { setLongitudinalSeriesId(event.target.value); setSelectedWaveKeys([]) }}><option value="">请选择</option>{series.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.seriesKey} · waves {item.waveCount}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Published spec<select aria-label="Published spec" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={longitudinalSpecId} onChange={(event) => setLongitudinalSpecId(event.target.value)}><option value="">请选择</option>{longitudinalSpecs.map((spec) => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version}</option>)}</select></label></div>{longitudinalKind === 'MATCHED_LONGITUDINAL' && <label className="mt-3 grid min-w-0 max-w-xs gap-1 text-sm font-medium">Matched mode<select aria-label="Matched mode" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={matchedMode} onChange={(event) => setMatchedMode(event.target.value as typeof matchedMode)}><option>PAIRWISE</option><option>FULL_CASE</option></select></label>}<fieldset className="mt-4"><legend className="text-sm font-medium">选择至少两个 Wave</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{currentSeries?.waves.map((wave) => <label key={wave.waveId} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3"><input type="checkbox" checked={selectedWaveKeys.includes(wave.waveKey)} onChange={(event) => setSelectedWaveKeys((current) => event.target.checked ? [...current, wave.waveKey] : current.filter((key) => key !== wave.waveKey))} /><span>{wave.waveKey} · ordinal {wave.ordinal}</span></label>)}</div>{currentSeries?.wavesTruncated && <p className="mt-2 text-sm text-amber-700">此 Series 的 discovery wave 列表已截断；需要更老 Wave 时应增加后端分页，而不是在客户端猜测。</p>}</fieldset><div className="mt-4"><ProductButton variant="primary" disabled={busy || selectedWaveKeys.length < 2 || !longitudinalSpecId} onClick={() => void generateLongitudinal()}>生成 {longitudinalKind}</ProductButton></div></div>
      </section>

      </details>
      <details className="mt-8" onToggle={(event) => { if (event.currentTarget.open) void loadProtectedDiscovery() }}><summary>高级设置：受保护反馈与历史报告读取</summary>
      <section className="mt-8 space-y-4" aria-labelledby="protected-heading">
        <div><h2 id="protected-heading" className="text-xl font-semibold">Protected feedback</h2><p className="mt-1 text-sm text-slate-600">Source discovery 已按 subject-scoped manager authority 过滤，只暴露 frozen subject/source identity，不暴露 respondent identities/counts。</p></div>
        <div className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm font-medium">Protected source<select aria-label="Protected source" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={protectedSourceKey} onChange={(event) => setProtectedSourceKey(event.target.value)}><option value="">请选择</option>{protectedSources.map((source) => { const key = `${sourceKey(source)}::${source.subject.userId}::${source.relationshipKind}::${source.perspective}`; return <option key={key} value={key}>{source.runName} · subject {source.subject.userId} · {source.relationshipKind}/{source.perspective}</option> })}</select></label><label className="grid min-w-0 gap-1 text-sm font-medium">Published protected spec<select aria-label="Published protected spec" className="min-h-11 min-w-0 w-full rounded-lg border border-slate-300 px-3" value={protectedSpecId} onChange={(event) => setProtectedSpecId(event.target.value)}><option value="">请选择</option>{protectedSpecs.map((spec) => <option key={spec.specId} value={spec.specId}>{spec.specKey} v{spec.version}</option>)}</select></label><div className="flex items-end md:col-span-2"><ProductButton variant="primary" disabled={busy || !protectedSourceKey || !protectedSpecId} onClick={() => void generateProtected()}>生成受保护反馈</ProductButton></div></div>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="artifact-read-heading"><div><h2 id="artifact-read-heading" className="text-xl font-semibold">按记录编号读取历史报告</h2><p className="mt-1 text-sm text-slate-600">每次读取都会重新执行当前 authorization；历史 artifact ID 本身不授予访问权。</p></div><div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row"><input className="min-h-11 min-w-0 w-full flex-1 rounded-lg border border-slate-300 px-3" value={artifactId} onChange={(event) => setArtifactId(event.target.value)} placeholder="artifact UUID" /><ProductButton disabled={busy || !artifactId.trim()} onClick={() => void readArtifact()}>读取历史报告</ProductButton></div></section>

      </details>
      </fieldset>
      {artifact && <ProjectionPanel artifact={artifact} />}
    </ProductPage>
  )
}
