import type {
  CognitiveDomainResult,
  CognitivePackageAnalysisResult,
  EvidenceItem,
} from '../cognitive-analysis'
import type {
  CompositePackageReport,
  CompositeParticipantDomain,
  CompositeReportAudience,
  CompositeReportProjectionInput,
  CompositeSafeRecommendation,
  CompositeSnapshotMetadata,
  CompositeTeacherSourceSummary,
} from './composite-report.types'

const uniqueStrings = (values: string[]): string[] => [...new Set(values)]

const isoDate = (value: Date | string): string => value instanceof Date ? value.toISOString() : String(value)

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((entry): entry is string => typeof entry === 'string')
  : []

const stripPayloadEncrypted = (value: any): any => {
  if (Array.isArray(value)) return value.map(stripPayloadEncrypted)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'payloadEncrypted')
      .map(([key, entry]) => [key, stripPayloadEncrypted(entry)]),
  )
}

const projectStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => key !== 'payloadEncrypted' && typeof entry === 'string') as Array<[string, string]>,
  )
}

const projectQualitySummary = (value: CognitivePackageAnalysisResult['qualitySummary']): CognitivePackageAnalysisResult['qualitySummary'] => ({
  interpretableModules: typeof value?.interpretableModules === 'number' ? value.interpretableModules : 0,
  excludedModules: stringArray(value?.excludedModules),
  warnings: stringArray(value?.warnings),
})

const safeMetricView = (metric: any) => {
  if (!metric || typeof metric !== 'object' || Array.isArray(metric)) return null
  const { key, label, unit, formatted } = metric
  return {
    key,
    label,
    ...(unit !== undefined ? { unit } : {}),
    formatted,
  }
}

const safeProductIndex = (productIndex: any) => {
  if (!productIndex || typeof productIndex !== 'object' || Array.isArray(productIndex)) return null
  return {
    label: productIndex.label,
    value: productIndex.value,
  }
}

/**
 * Keep the existing single-task presentation contract while removing the
 * encrypted-result projection fields owned by the composite builder.
 */
const projectSafeSingleTaskReport = (
  report: any,
  metricDefinitions?: Record<string, { availableProfiles?: string[]; role?: string }>,
) => {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null
  const participantMetric = (metric: any) => {
    if (!metric || typeof metric !== 'object' || Array.isArray(metric)) return null
    const definition = metricDefinitions?.[metric.key]
    // A participant/teacher view of a frozen research Profile must fail
    // closed: only metrics explicitly available to the standard Profile may
    // cross the HTTP boundary. The frozen definition is authoritative.
    if (
      definition?.role === 'research_only'
      || (report.profile === 'research' && !definition?.availableProfiles?.includes('standard'))
      || (definition?.availableProfiles && !definition.availableProfiles.includes('standard'))
    ) {
      return null
    }
    return safeMetricView(metric)
  }
  const visibleMetrics = (metrics: any[]) => metrics.map(participantMetric).filter(Boolean)
  return {
    testType: report.testType,
    profile: report.profile ?? null,
    profileLabel: report.profileLabel ?? null,
    title: report.title,
    interpretable: report.interpretable,
    qualityState: report.qualityState,
    qualityFlags: Array.isArray(report.qualityFlags)
      ? report.qualityFlags
        .filter((flag: any) => flag && typeof flag === 'object' && !Array.isArray(flag))
        .map((flag: any) => ({ key: flag.key, label: flag.label, active: flag.active }))
      : [],
    headline: participantMetric(report.headline),
    productIndex: safeProductIndex(report.productIndex),
    primaryMetrics: Array.isArray(report.primaryMetrics) ? visibleMetrics(report.primaryMetrics) : [],
    secondaryMetrics: Array.isArray(report.secondaryMetrics) ? visibleMetrics(report.secondaryMetrics) : [],
    caveats: stringArray(report.caveats),
    practicalTips: stringArray(report.practicalTips),
    // Method versions and reference observations are internal/raw comparison
    // details for the full researcher report, not participant/teacher fields.
    method: {
      testType: report.method?.testType ?? report.testType,
      profile: report.method?.profile ?? report.profile ?? null,
    },
    disclaimer: typeof report.disclaimer === 'string' ? report.disclaimer : '',
    reference: null,
  }
}

export const projectCompositeUnitReports = (
  unitReports: any[],
  audience: CompositeReportAudience,
): any[] => {
  const projected: any[] = []
  for (const unit of unitReports) {
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) continue
    if (unit.type === 'SCALE') {
      projected.push(stripPayloadEncrypted(unit))
      continue
    }
    if (unit.type !== 'COGNITIVE') continue
    if (audience === 'researcher') {
      projected.push(stripPayloadEncrypted(unit))
      continue
    }
    if (unit.decryptError) {
      projected.push({
        itemId: unit.itemId,
        type: unit.type,
        kind: unit.kind,
        label: unit.label ?? null,
        decryptError: true,
      })
      continue
    }
    projected.push({
      itemId: unit.itemId,
      type: unit.type,
      kind: unit.kind,
      label: unit.label ?? null,
      testType: unit.testType ?? null,
      finishedAt: unit.finishedAt ?? null,
      qualityState: unit.singleTaskReport?.qualityState ?? null,
      singleTaskReport: projectSafeSingleTaskReport(unit.singleTaskReport, unit.__frozenMetricDefinitions),
    })
  }
  return projected
}

const participantDomain = (domain: CognitiveDomainResult): CompositeParticipantDomain => {
  const byFacet = new Map<string, EvidenceItem[]>()
  for (const item of domain.evidence) {
    const facet = item.facet ?? '未细分'
    const existing = byFacet.get(facet) ?? []
    existing.push(item)
    byFacet.set(facet, existing)
  }
  const facetCoverage = [...byFacet.entries()].map(([facet, evidence]) => ({
    facet,
    evidenceCount: evidence.length,
    interpretable: evidence.some((item) => item.interpretable && item.value !== null),
    directionClasses: uniqueStrings(evidence.map((item) => item.directionClass)),
  }))
  return {
    domain: domain.domain,
    label: domain.label,
    status: domain.status,
    consistency: domain.consistency,
    summary: domain.summary,
    caveats: stringArray(domain.caveats),
    facetCoverage,
  }
}

const safeRecommendations = (
  analysis: CognitivePackageAnalysisResult,
  audience: 'participant' | 'teacher',
): CompositeSafeRecommendation[] => analysis.recommendations
  .filter((recommendation) => recommendation.audience === audience)
  .map(({ priority, text }) => ({ priority, text }))

const teacherSourceSummary = (evidence: EvidenceItem[]): CompositeTeacherSourceSummary[] => evidence.map((item) => ({
  slotKey: typeof item.provenance?.slotKey === 'string' ? item.provenance.slotKey : null,
  taskType: typeof item.provenance?.testType === 'string' ? item.provenance.testType : null,
  facet: item.facet ?? null,
  role: item.role,
  interpretable: item.interpretable,
  qualityFlags: stringArray(item.qualityFlags),
  directionClass: item.directionClass,
}))

const projectEvidence = (item: EvidenceItem): EvidenceItem => ({
  id: item.id,
  sourceType: item.sourceType,
  sourceResultId: item.sourceResultId,
  construct: item.construct,
  ...(item.facet !== undefined ? { facet: item.facet } : {}),
  ...(item.metricKey !== undefined ? { metricKey: item.metricKey } : {}),
  value: stripPayloadEncrypted(item.value),
  ...(item.unit !== undefined ? { unit: item.unit } : {}),
  role: item.role,
  interpretation: item.interpretation,
  directionClass: item.directionClass,
  interpretable: item.interpretable,
  qualityFlags: stringArray(item.qualityFlags),
  provenance: projectStringRecord(item.provenance),
})

const projectResearcherDomain = (domain: CognitiveDomainResult): CognitiveDomainResult => ({
  domain: domain.domain,
  label: domain.label,
  status: domain.status,
  evidence: domain.evidence.map(projectEvidence),
  consistency: domain.consistency,
  summary: domain.summary,
  strengths: stringArray(domain.strengths),
  watchItems: stringArray(domain.watchItems),
  caveats: stringArray(domain.caveats),
})

const projectCrossSourceFinding = (finding: CognitivePackageAnalysisResult['crossSourceFindings'][number]) => ({
  construct: finding.construct,
  type: finding.type,
  evidenceRefs: stringArray(finding.evidenceRefs),
  summary: finding.summary,
  ...(finding.caveat !== undefined ? { caveat: finding.caveat } : {}),
  confidence: finding.confidence,
})

const projectResearcherRecommendation = (recommendation: CognitivePackageAnalysisResult['recommendations'][number]) => ({
  ruleId: recommendation.ruleId,
  ruleVersion: recommendation.ruleVersion,
  audience: recommendation.audience,
  priority: recommendation.priority,
  evidenceRefs: stringArray(recommendation.evidenceRefs),
  text: recommendation.text,
})

const snapshotMetadata = (
  input: CompositeReportProjectionInput,
  includeSensitive: boolean,
): CompositeSnapshotMetadata => {
  const row = input.snapshot
  const payload = row.payload
  return {
    id: row.id,
    attemptId: row.attemptId,
    packageKey: row.packageKey,
    packageVersion: row.packageVersion,
    profile: payload.profile,
    analysisDefinitionVersion: row.analysisDefinitionVersion,
    analysisProtocolKey: payload.analysisProtocolKey,
    analysisProtocolVersion: payload.analysisProtocolVersion,
    analysisVersion: row.analysisVersion,
    reportSchemaVersion: row.reportSchemaVersion,
    ...(includeSensitive ? { inputFingerprint: row.inputFingerprint, generatedBy: row.generatedBy } : {}),
    generationReason: row.generationReason,
    createdAt: isoDate(row.createdAt),
  }
}

const basePackageReport = (
  input: CompositeReportProjectionInput,
): Pick<CompositePackageReport, 'packageName' | 'packageKey' | 'packageVersion' | 'profile' | 'qualitySummary' | 'limitations'> => ({
  packageName: input.packageSnapshot.packageDefinition.name,
  packageKey: input.snapshot.payload.packageKey,
  packageVersion: input.snapshot.payload.packageVersion,
  profile: input.snapshot.payload.profile,
  qualitySummary: projectQualitySummary(input.snapshot.payload.qualitySummary),
  limitations: stringArray(input.snapshot.payload.limitations),
})

const buildPackageReport = (input: CompositeReportProjectionInput): CompositePackageReport => {
  const analysis = input.snapshot.payload
  const base = basePackageReport(input)
  const domains = analysis.cognitiveDomains.map(participantDomain)

  if (input.audience === 'participant') {
    return {
      audience: 'participant',
      ...base,
      cognitiveDomains: domains,
      recommendations: safeRecommendations(analysis, 'participant'),
    }
  }

  const metadata = snapshotMetadata(input, input.audience === 'researcher')
  if (input.audience === 'teacher') {
    const sourceSummary = teacherSourceSummary(analysis.evidence)
    return {
      audience: 'teacher',
      ...base,
      snapshotId: metadata.id,
      snapshotCreatedAt: metadata.createdAt,
      generationReason: metadata.generationReason,
      cognitiveDomains: domains,
      recommendations: safeRecommendations(analysis, 'teacher'),
      sourceSummary,
      qualityFlags: uniqueStrings(sourceSummary.flatMap((source) => source.qualityFlags)),
      observationPrompts: uniqueStrings(analysis.cognitiveDomains.flatMap((domain) => domain.watchItems)),
    }
  }

  return {
    audience: 'researcher',
    ...base,
    snapshotId: metadata.id,
    snapshotCreatedAt: metadata.createdAt,
    generationReason: metadata.generationReason,
    analysisDefinitionVersion: metadata.analysisDefinitionVersion,
    analysisProtocolKey: metadata.analysisProtocolKey,
    analysisProtocolVersion: metadata.analysisProtocolVersion,
    analysisVersion: metadata.analysisVersion,
    reportSchemaVersion: metadata.reportSchemaVersion,
    inputFingerprint: metadata.inputFingerprint ?? '',
    cognitiveDomains: analysis.cognitiveDomains.map(projectResearcherDomain),
    recommendations: analysis.recommendations.map(projectResearcherRecommendation),
    evidence: analysis.evidence.map(projectEvidence),
    crossSourceFindings: analysis.crossSourceFindings.map(projectCrossSourceFinding),
    provenance: projectStringRecord(analysis.provenance),
  }
}

const withLegacyModules = (report: Record<string, any>): Record<string, any> => {
  Object.defineProperty(report, 'modules', {
    value: report.unitReports,
    enumerable: false,
  })
  return report
}

const projectReportEnvelope = (report: Record<string, any>, audience: CompositeReportAudience) => ({
  id: report.id,
  assessmentId: report.assessmentId,
  name: report.name,
  anonymousCode: report.anonymousCode ?? null,
  completedAt: report.completedAt ?? null,
  totalTime: report.totalTime ?? null,
  backgroundValues: Array.isArray(report.backgroundValues)
    ? report.backgroundValues.map((background) => ({
        itemId: background.itemId,
        type: 'FORM' as const,
        kind: 'background' as const,
        label: typeof background.label === 'string' ? background.label : null,
        value: typeof background.value === 'string' ? background.value : null,
      }))
    : [],
  unitReports: projectCompositeUnitReports(report.unitReports ?? [], audience),
})

export const projectCompositeReport = (input: CompositeReportProjectionInput): Record<string, any> => withLegacyModules({
  ...projectReportEnvelope(input.report, input.audience),
  packageReport: buildPackageReport(input),
})

export const projectCompositeCollectionReport = (
  report: Record<string, any>,
  audience: CompositeReportAudience,
): Record<string, any> => withLegacyModules(projectReportEnvelope(report, audience))
