import { workbookBuffer } from '../../utils/excelWorkbook'
import { buildZipStore } from '../cognitive/export-zip'
import { exportCognitiveToCSV, type CognitiveExportField } from '../cognitive/export.service'
import type { FrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'
import type { DecryptedCompositeAnalysisSnapshot } from './composite-analysis-snapshot.service'
import {
  projectCompositePackageAnalysis,
} from './composite-report.projector'
import type {
  CompositePackageReport,
  CompositeMentalHealthPackageReport,
  CompositeParticipantPackageReport,
  CompositeResearcherPackageReport,
  CompositeTeacherPackageReport,
  CompositeReportAudience,
} from './composite-report.types'

export type CompositeAnalysisExportFormat = 'json' | 'zip' | 'xlsx'

export const COMPOSITE_ANALYSIS_EXPORT_SCHEMA_VERSION = 'composite-analysis-export-v1'

export interface CompositeAnalysisExportContext {
  attemptId: string
  assessmentId: string
  assessmentName: string
  audience: CompositeReportAudience
  packageSnapshot: FrozenReportPackageSnapshot
  snapshot: DecryptedCompositeAnalysisSnapshot
}

export interface CompositeAnalysisExportResult {
  fileName: string
  contentType: string
  body: Buffer
}

interface AnalysisTable {
  headers: string[]
  rows: Array<Record<string, unknown>>
  numericHeaders?: string[]
}

interface AnalysisExportDocument {
  exportSchemaVersion: typeof COMPOSITE_ANALYSIS_EXPORT_SCHEMA_VERSION
  source: 'frozen_snapshot'
  audience: CompositeReportAudience
  attempt: {
    id: string
    assessmentId: string
    assessmentName: string
  }
  package: {
    name: string
    key: string
    version: string
    profile: 'standard' | 'research'
  }
  snapshot?: {
    id: string
    attemptId: string
    generationReason: 'COMPLETION' | 'REANALYSIS'
    createdAt: string
    analysisDefinitionVersion?: string
    analysisProtocolKey?: string
    analysisProtocolVersion?: string
    analysisVersion?: string
    reportSchemaVersion?: string
    inputFingerprint?: string
  }
  analysis: CompositePackageReport
}

const safeString = (value: unknown): string => typeof value === 'string' ? value : ''

const isMentalHealthReport = (
  analysis: CompositePackageReport,
): analysis is CompositeMentalHealthPackageReport => (
  'outcomeCode' in analysis && 'mainConstruct' in analysis && 'nextSteps' in analysis
)

const isoDate = (value: Date | string): string => value instanceof Date ? value.toISOString() : String(value)

const jsonCell = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}

const packageReportFor = (context: CompositeAnalysisExportContext): CompositePackageReport =>
  projectCompositePackageAnalysis({
    packageSnapshot: context.packageSnapshot,
    snapshot: context.snapshot,
    audience: context.audience,
  })

const documentFor = (
  context: CompositeAnalysisExportContext,
  analysis: CompositePackageReport,
): AnalysisExportDocument => {
  const snapshot = context.audience === 'participant'
    ? undefined
    : {
        id: context.snapshot.id,
        attemptId: context.snapshot.attemptId,
        generationReason: context.snapshot.generationReason,
        createdAt: isoDate(context.snapshot.createdAt),
        ...(context.audience === 'researcher'
          ? {
              analysisDefinitionVersion: context.snapshot.analysisDefinitionVersion,
              analysisProtocolKey: context.snapshot.payload.analysisProtocolKey,
              analysisProtocolVersion: context.snapshot.payload.analysisProtocolVersion,
              analysisVersion: context.snapshot.analysisVersion,
              reportSchemaVersion: context.snapshot.reportSchemaVersion,
              inputFingerprint: context.snapshot.inputFingerprint,
            }
          : {}),
      }

  return {
    exportSchemaVersion: COMPOSITE_ANALYSIS_EXPORT_SCHEMA_VERSION,
    source: 'frozen_snapshot',
    audience: context.audience,
    attempt: {
      id: context.attemptId,
      assessmentId: context.assessmentId,
      assessmentName: context.assessmentName,
    },
    package: {
      name: context.packageSnapshot.packageDefinition.name,
      key: context.packageSnapshot.packageKey,
      version: context.packageSnapshot.packageVersion,
      profile: context.packageSnapshot.profile,
    },
    ...(snapshot ? { snapshot } : {}),
    analysis,
  }
}

const safeDomainRows = (
  analysis: CompositeParticipantPackageReport | CompositeTeacherPackageReport,
): AnalysisTable => {
  const headers = [
    'row_type',
    'domain',
    'domain_label',
    'status',
    'consistency',
    'summary',
    'facet',
    'evidence_count',
    'interpretable',
    'direction_classes',
    'source_type',
    'slot_key',
    'task_type',
    'role',
    'direction_class',
    'quality_flags',
  ]
  const rows: Array<Record<string, unknown>> = []

  for (const domain of analysis.cognitiveDomains) {
    const facets = domain.facetCoverage ?? []
    if (facets.length === 0) {
      rows.push({
        row_type: 'domain_facet',
        domain: domain.domain,
        domain_label: domain.label,
        status: domain.status,
        consistency: domain.consistency,
        summary: domain.summary,
        facet: null,
        evidence_count: 0,
        interpretable: false,
        direction_classes: null,
        source_type: null,
        slot_key: null,
        task_type: null,
        role: null,
        direction_class: null,
        quality_flags: null,
      })
      continue
    }
    for (const facet of facets) {
      rows.push({
        row_type: 'domain_facet',
        domain: domain.domain,
        domain_label: domain.label,
        status: domain.status,
        consistency: domain.consistency,
        summary: domain.summary,
        facet: facet.facet,
        evidence_count: facet.evidenceCount,
        interpretable: facet.interpretable,
        direction_classes: facet.directionClasses.join('|'),
        source_type: null,
        slot_key: null,
        task_type: null,
        role: null,
        direction_class: null,
        quality_flags: null,
      })
    }
  }

  if (analysis.audience === 'teacher') {
    for (const source of analysis.sourceSummary) {
      rows.push({
        row_type: 'source_summary',
        domain: null,
        domain_label: null,
        status: null,
        consistency: null,
        summary: null,
        facet: source.facet,
        evidence_count: null,
        interpretable: source.interpretable,
        direction_classes: null,
        source_type: source.sourceType,
        slot_key: source.slotKey,
        task_type: source.taskType,
        role: source.role,
        direction_class: source.directionClass,
        quality_flags: source.qualityFlags.join('|'),
      })
    }
  }

  return { headers, rows, numericHeaders: ['evidence_count'] }
}

const researcherDomainRows = (analysis: CompositeResearcherPackageReport): AnalysisTable => {
  const headers = [
    'row_type',
    'domain',
    'domain_label',
    'status',
    'consistency',
    'summary',
    'facet',
    'evidence_count',
    'interpretable',
    'direction_classes',
    'evidence_id',
    'source_type',
    'source_result_id',
    'metric_key',
    'value_json',
    'unit',
    'role',
    'interpretation',
    'direction_class',
    'quality_flags',
    'provenance_json',
  ]
  const rows: Array<Record<string, unknown>> = []
  for (const domain of analysis.cognitiveDomains) {
    for (const evidence of domain.evidence ?? []) {
      rows.push({
        row_type: 'evidence',
        domain: domain.domain,
        domain_label: domain.label,
        status: domain.status,
        consistency: domain.consistency,
        summary: domain.summary,
        facet: safeString(evidence.facet),
        evidence_count: 1,
        interpretable: evidence.interpretable,
        direction_classes: safeString(evidence.directionClass),
        evidence_id: safeString(evidence.id),
        source_type: safeString(evidence.sourceType),
        source_result_id: safeString(evidence.sourceResultId),
        metric_key: safeString(evidence.metricKey),
        value_json: jsonCell(evidence.value),
        unit: safeString(evidence.unit),
        role: safeString(evidence.role),
        interpretation: safeString(evidence.interpretation),
        direction_class: safeString(evidence.directionClass),
        quality_flags: (evidence.qualityFlags ?? []).join('|'),
        provenance_json: jsonCell(evidence.provenance),
      })
    }
  }
  return { headers, rows, numericHeaders: ['evidence_count'] }
}

const mentalHealthEvidenceRows = (analysis: CompositeMentalHealthPackageReport): AnalysisTable => {
  if (analysis.audience !== 'researcher' || !analysis.bundleReportFacts) {
    return {
      headers: [
        'row_type',
        'construct',
        'outcome_code',
        'action_tier',
        'consistency',
        'interpretable_evidence_count',
        'excluded_evidence_count',
        'quality_state',
      ],
      rows: [{
        row_type: 'bundle_summary',
        construct: analysis.mainConstruct,
        outcome_code: analysis.outcomeCode,
        action_tier: analysis.actionTier,
        consistency: analysis.consistency,
        interpretable_evidence_count: analysis.qualitySummary.interpretableModules,
        excluded_evidence_count: analysis.qualitySummary.excludedModules.length,
        quality_state: analysis.outcomeCode === 'INSUFFICIENT_QUALITY' ? 'invalid' : 'role_restricted',
      }],
      numericHeaders: ['interpretable_evidence_count', 'excluded_evidence_count'],
    }
  }

  const headers = [
    'row_type',
    'evidence_id',
    'source_result_id',
    'slot_key',
    'scale_id',
    'scale_code',
    'instrument_version',
    'score_key',
    'value',
    'score_status',
    'classification',
    'role',
    'construct',
    'facet',
    'direction',
    'quality_state',
    'quality_flags',
    'interpretable',
    'provenance_json',
  ]
  const rows = analysis.bundleReportFacts.evidence.map((evidence) => ({
    row_type: 'bundle_evidence',
    evidence_id: evidence.id,
    source_result_id: evidence.sourceResultId,
    slot_key: evidence.slotKey,
    scale_id: evidence.scaleId,
    scale_code: evidence.scaleCode,
    instrument_version: evidence.instrumentVersion,
    score_key: evidence.scoreKey,
    value: evidence.value,
    score_status: evidence.scoreStatus,
    classification: evidence.classification,
    role: evidence.role,
    construct: evidence.construct,
    facet: evidence.facet ?? null,
    direction: evidence.direction,
    quality_state: evidence.qualityState,
    quality_flags: evidence.qualityFlags.join('|'),
    interpretable: evidence.interpretable,
    provenance_json: jsonCell(evidence.provenance),
  }))
  return { headers, rows, numericHeaders: ['value'] }
}

const domainEvidenceTableFor = (analysis: CompositePackageReport): AnalysisTable => {
  if (isMentalHealthReport(analysis)) return mentalHealthEvidenceRows(analysis)
  return analysis.audience === 'researcher' ? researcherDomainRows(analysis) : safeDomainRows(analysis)
}

const findingsTableFor = (analysis: CompositePackageReport): AnalysisTable => {
  if (isMentalHealthReport(analysis)) {
    if (analysis.audience !== 'researcher' || !analysis.bundleReportFacts) {
      return { headers: ['scope', 'availability'], rows: [] }
    }
    const rows = [
      ...analysis.bundleReportFacts.facetFindings,
      ...analysis.bundleReportFacts.contextFindings,
    ].map((finding) => ({
      scope: finding.role,
      key: finding.key,
      evidence_refs: finding.evidenceRefs.join('|'),
      feedback_block_key: finding.feedbackBlockKey,
      available: finding.available,
    }))
    return {
      headers: ['scope', 'key', 'evidence_refs', 'feedback_block_key', 'available'],
      rows,
    }
  }
  if (analysis.audience !== 'researcher') {
    return {
      headers: ['scope', 'availability'],
      rows: [],
    }
  }
  const headers = ['construct', 'type', 'evidence_refs', 'summary', 'caveat', 'confidence', 'availability']
  const rows = analysis.crossSourceFindings.map((finding) => ({
    construct: safeString(finding.construct),
    type: safeString(finding.type),
    evidence_refs: Array.isArray(finding.evidenceRefs) ? finding.evidenceRefs.join('|') : '',
    summary: safeString(finding.summary),
    caveat: safeString(finding.caveat),
    confidence: safeString(finding.confidence),
    availability: safeString(finding.availability),
  }))
  return { headers, rows }
}

const recommendationsTableFor = (analysis: CompositePackageReport): AnalysisTable => {
  if (isMentalHealthReport(analysis)) {
    const rows = analysis.nextSteps.map((text) => ({
      priority: analysis.actionTier,
      text,
    }))
    return { headers: ['priority', 'text'], rows }
  }
  if (analysis.audience !== 'researcher') {
    return {
      headers: ['priority', 'text'],
      rows: analysis.recommendations.map((recommendation) => ({
        priority: recommendation.priority,
        text: recommendation.text,
      })),
    }
  }
  return {
    headers: ['rule_id', 'rule_version', 'audience', 'construct', 'priority', 'evidence_refs', 'text'],
    rows: analysis.recommendations.map((recommendation) => ({
      rule_id: recommendation.ruleId,
      rule_version: recommendation.ruleVersion,
      audience: recommendation.audience,
      construct: recommendation.construct ?? null,
      priority: recommendation.priority,
      evidence_refs: recommendation.evidenceRefs.join('|'),
      text: recommendation.text,
    })),
  }
}

const analysisTableFor = (
  context: CompositeAnalysisExportContext,
  analysis: CompositePackageReport,
): AnalysisTable => {
  const rows: Array<Record<string, unknown>> = [
    { key: 'export_schema_version', value: COMPOSITE_ANALYSIS_EXPORT_SCHEMA_VERSION },
    { key: 'source', value: 'frozen_snapshot' },
    { key: 'audience', value: context.audience },
    { key: 'attempt_id', value: context.attemptId },
    { key: 'assessment_id', value: context.assessmentId },
    { key: 'assessment_name', value: context.assessmentName },
    { key: 'package_key', value: analysis.packageKey },
    { key: 'package_version', value: analysis.packageVersion },
    { key: 'profile', value: analysis.profile },
    { key: 'quality_interpretable_modules', value: analysis.qualitySummary.interpretableModules },
    { key: 'quality_excluded_modules', value: analysis.qualitySummary.excludedModules.join('|') },
    { key: 'quality_warnings', value: analysis.qualitySummary.warnings.join('|') },
  ]

  if (isMentalHealthReport(analysis)) {
    rows.push(
      { key: 'outcome_code', value: analysis.outcomeCode },
      { key: 'action_tier', value: analysis.actionTier },
      { key: 'main_construct', value: analysis.mainConstruct },
      { key: 'consistency', value: analysis.consistency },
      { key: 'conclusion', value: analysis.conclusion },
    )
  }

  if (context.audience !== 'participant') {
    rows.push(
      { key: 'snapshot_id', value: context.snapshot.id },
      { key: 'snapshot_attempt_id', value: context.snapshot.attemptId },
      { key: 'snapshot_generation_reason', value: context.snapshot.generationReason },
      { key: 'snapshot_created_at', value: isoDate(context.snapshot.createdAt) },
    )
  }
  if (context.audience === 'researcher') {
    rows.push(
      { key: 'analysis_definition_version', value: context.snapshot.analysisDefinitionVersion },
      { key: 'analysis_protocol_key', value: context.snapshot.payload.analysisProtocolKey },
      { key: 'analysis_protocol_version', value: context.snapshot.payload.analysisProtocolVersion },
      { key: 'analysis_version', value: context.snapshot.analysisVersion },
      { key: 'report_schema_version', value: context.snapshot.reportSchemaVersion },
      { key: 'input_fingerprint', value: context.snapshot.inputFingerprint },
    )
  }

  return {
    headers: ['key', 'value'],
    rows,
    numericHeaders: ['quality_interpretable_modules'],
  }
}

const provenanceTableFor = (
  context: CompositeAnalysisExportContext,
  analysis: CompositePackageReport,
): AnalysisTable => {
  if (context.audience === 'participant') {
    return {
      headers: ['scope', 'description'],
      rows: [{ scope: 'restricted', description: '该受众仅导出安全的 Domain、facet、质量、限制和建议字段。' }],
    }
  }

  const rows: Array<Record<string, unknown>> = [
    { key: 'snapshot_id', value: context.snapshot.id },
    { key: 'snapshot_attempt_id', value: context.snapshot.attemptId },
    { key: 'snapshot_generation_reason', value: context.snapshot.generationReason },
    { key: 'snapshot_created_at', value: isoDate(context.snapshot.createdAt) },
  ]

  if (context.audience === 'researcher') {
    rows.unshift(
      { key: 'source', value: 'frozen_snapshot' },
      { key: 'attempt_id', value: context.attemptId },
      { key: 'assessment_id', value: context.assessmentId },
      { key: 'package_key', value: context.snapshot.payload.packageKey },
      { key: 'package_version', value: context.snapshot.payload.packageVersion },
      { key: 'analysis_protocol_key', value: context.snapshot.payload.analysisProtocolKey },
      { key: 'analysis_protocol_version', value: context.snapshot.payload.analysisProtocolVersion },
      { key: 'analysis_version', value: context.snapshot.analysisVersion },
      { key: 'report_schema_version', value: context.snapshot.reportSchemaVersion },
    )
    rows.push({ key: 'input_fingerprint', value: context.snapshot.inputFingerprint })
    const provenance = isMentalHealthReport(analysis)
      ? (analysis.bundleReportFacts?.provenance ?? {})
      : analysis.audience === 'researcher'
        ? analysis.provenance
        : {}
    for (const [key, value] of Object.entries(provenance)) {
      rows.push({ key, value })
    }
  }
  return { headers: ['key', 'value'], rows }
}

const csvFor = (table: AnalysisTable): string => {
  const numericHeaders = new Set(table.numericHeaders ?? [])
  const fields: CognitiveExportField[] = table.headers.map((name) => ({
    name,
    label: name,
    type: numericHeaders.has(name) ? 'numeric' : 'string',
  }))
  return exportCognitiveToCSV({ fields, rows: table.rows })
}

const xlsxFor = async (tables: Record<string, AnalysisTable>): Promise<Buffer> => (
  workbookBuffer(Object.fromEntries(Object.entries(tables).map(([name, table]) => [
    name,
    { rows: table.rows, headers: table.headers },
  ])))
)

const readmeFor = (context: CompositeAnalysisExportContext): string => [
  'eduK12 composite analysis export v1',
  '',
  context.audience === 'participant'
    ? 'source: one immutable completion Snapshot selected for this Attempt'
    : `source: one immutable ${context.snapshot.generationReason} Snapshot selected for this Attempt`,
  `audience: ${context.audience}`,
  `attemptId: ${context.attemptId}`,
  '',
  'analysis.json: role-projected analysis and frozen Snapshot metadata allowed for this audience.',
  'domain_evidence.csv: Domain and facet coverage; researcher exports also include frozen Evidence details.',
  'cross_source_findings.csv: descriptive cross-source findings for researcher exports; restricted audiences receive an empty table.',
  'recommendations.csv: fixed, versioned, non-diagnostic recommendations with audience-safe fields.',
  'Provenance and version fields describe the frozen package and analysis inputs; no live Registry analysis is performed.',
  'Results are descriptive only. They do not provide diagnosis, causal inference, disciplinary advice, IQ, percentile, or an overall score.',
].join('\n') + '\n'

export const buildCompositeAnalysisExport = async (
  context: CompositeAnalysisExportContext,
  format: CompositeAnalysisExportFormat,
): Promise<CompositeAnalysisExportResult> => {
  const analysis = packageReportFor(context)
  const document = documentFor(context, analysis)
  const domainEvidence = domainEvidenceTableFor(analysis)
  const findings = findingsTableFor(analysis)
  const recommendations = recommendationsTableFor(analysis)
  const provenance = provenanceTableFor(context, analysis)
  const analysisTable = analysisTableFor(context, analysis)
  const analysisJson = `${JSON.stringify(document, null, 2)}\n`

  if (format === 'json') {
    return {
      fileName: 'analysis.json',
      contentType: 'application/json',
      body: Buffer.from(analysisJson, 'utf8'),
    }
  }

  if (format === 'xlsx') {
    return {
      fileName: 'analysis.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: await xlsxFor({
        Analysis: analysisTable,
        DomainEvidence: domainEvidence,
        Findings: findings,
        Recommendations: recommendations,
        Provenance: provenance,
      }),
    }
  }

  const zip = buildZipStore([
    { name: 'analysis.json', data: analysisJson },
    { name: 'domain_evidence.csv', data: csvFor(domainEvidence) },
    { name: 'cross_source_findings.csv', data: csvFor(findings) },
    { name: 'recommendations.csv', data: csvFor(recommendations) },
    { name: 'README.txt', data: readmeFor(context) },
  ])
  return {
    fileName: 'analysis.zip',
    contentType: 'application/zip',
    body: zip,
  }
}

export const compositeAnalysisExportService = {
  buildCompositeAnalysisExport,
}
