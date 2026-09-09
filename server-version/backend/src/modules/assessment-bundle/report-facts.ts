/**
 * BundleReportFacts projector, audience projections, and non-authoritative exports.
 * HTML/Markdown are presentation only — BundleReportFactsV1 remains authoritative.
 * Audience projections never include raw answers or sensitive Context values.
 */

import { canonicalHash } from '../assessment-runtime/canonical'
import {
  assertContextDefinitionHashMatchesSnapshot,
  validateFrozenAssessmentBundleSnapshot,
} from './snapshot'
import { buildBundleReportFacts, validateBundleContextFacts, validateBundleReportFacts } from './evidence'
import { bundleContractFail } from './errors'
import type { BundleAnalysisEngineRegistry, BundleEngineInputV1 } from './registry'
import { rollupEvidenceQuality } from './engines/mental-health-rule-v1'
import { projectScaleEvidenceItems } from './engines/scale-evidence-v1'
import type { BundleFrozenCognitiveSourceV1, BundleFrozenSituationalSourceV1 } from './sources'
import type {
  BundleContextFactsV1,
  BundleReportAudienceV1,
  BundleReportEnginePayloadV1,
  BundleReportFactsV1,
  EvidenceItemV1,
  EvidenceQualityStateV1,
  EvidenceRoleV1,
  FrozenAssessmentBundleSnapshotV3,
} from './types'

const asScalar = (value: unknown): number | string | boolean | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' || typeof value === 'boolean') return value
  return null
}

/** evidenceKey/constructKey must match CONSTRUCT_KEY (lowercase segments). */
const toConstructSegment = (value: string): string => (
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .toLowerCase()
    .replace(/^[^a-z]+/, 'm_')
)

const toConstructPath = (value: string): string => value.split('.').map(toConstructSegment).join('.')

/**
 * Project Cognitive metrics into EvidenceItemV1 rows (deferred from earlier commits).
 */
export const projectCognitiveEvidenceItems = (input: {
  source: BundleFrozenCognitiveSourceV1
  metricKeys: string[]
  constructKeyPrefix?: string
  role?: EvidenceRoleV1
}): EvidenceItemV1[] => {
  const prefix = input.constructKeyPrefix ?? input.source.instrumentKey
  const role = input.role ?? 'PRIMARY'
  return input.metricKeys.map((metricKey) => {
    const raw = input.source.metrics[metricKey]
    const value = asScalar(raw)
    const hasMetric = Object.prototype.hasOwnProperty.call(input.source.metrics, metricKey)
    let quality: EvidenceQualityStateV1
    if (input.source.qualityState === 'invalid') quality = 'invalid'
    // Required selector missing → UNAVAILABLE (never interpretable-with-null).
    else if (!hasMetric || value === null) quality = 'unavailable'
    else if (input.source.qualityState === 'limited') quality = 'limited'
    else quality = 'interpretable'
    const metricSeg = toConstructSegment(metricKey)
    const prefixSeg = toConstructSegment(prefix)
    const slotSeg = toConstructSegment(input.source.slotKey)

    return {
      evidenceKey: `${slotSeg}.${prefixSeg}.${metricSeg}.primary`,
      constructKey: `${prefixSeg}.${metricSeg}`,
      source: {
        kind: 'COGNITIVE_METRIC',
        slotKey: input.source.slotKey,
        metricKey,
        sourceResultHash: input.source.sourceResultHash,
      },
      value: value === null
        ? { state: 'missing' as const }
        : { state: 'present' as const, value },
      quality,
      criterionBandKey: null,
      role,
    }
  })
}

export const projectSituationalEvidenceItems = (input: {
  source: BundleFrozenSituationalSourceV1
  metricKeys: string[]
  role?: EvidenceRoleV1
}): EvidenceItemV1[] => {
  const role = input.role ?? 'PRIMARY'
  const prefix = toConstructSegment(input.source.instrumentKey)
  const slotSeg = toConstructSegment(input.source.slotKey)
  return input.metricKeys.map((metricKey) => {
    const raw = input.source.metrics[metricKey]
    const value = asScalar(raw)
    const hasMetric = Object.prototype.hasOwnProperty.call(input.source.metrics, metricKey)
    const metricPath = toConstructPath(metricKey)
    const quality = input.source.qualityState === 'invalid'
      ? 'invalid'
      : !hasMetric || value === null
        ? 'unavailable'
        : input.source.qualityState === 'limited' ? 'limited' : 'interpretable'
    return {
      evidenceKey: `${slotSeg}.${prefix}.${metricPath}.primary`,
      constructKey: `${prefix}.${metricPath}`,
      source: { kind: 'SITUATIONAL_METRIC', slotKey: input.source.slotKey, metricKey, sourceResultHash: input.source.sourceResultHash },
      value: value === null ? { state: 'missing' as const } : { state: 'present' as const, value },
      quality,
      criterionBandKey: null,
      role,
    }
  })
}

const collectEvidenceFromSources = (input: BundleEngineInputV1): EvidenceItemV1[] => {
  // Always build from authoritative projectors — never trust caller-supplied evidence shortcut.
  const collected: EvidenceItemV1[] = []
  for (const slot of input.snapshot.slotBindings) {
    if (slot.unitType === 'SCALE') {
      const source = (input.scaleSources ?? []).find((row) => row.slotKey === slot.slotKey)
      if (!source) continue
      const selectors = slot.valueSelectors && slot.valueSelectors.length > 0
        ? slot.valueSelectors
        : source.scores.map((score) => score.scoreKey)
      collected.push(...projectScaleEvidenceItems({
        source,
        scoreKeys: selectors,
        constructKeyPrefix: source.instrumentKey,
      }))
    }
    if (slot.unitType === 'COGNITIVE') {
      const source = (input.cognitiveSources ?? []).find((row) => row.slotKey === slot.slotKey)
      if (!source) continue
      const selectors = slot.valueSelectors && slot.valueSelectors.length > 0
        ? slot.valueSelectors
        : Object.keys(source.metrics)
      collected.push(...projectCognitiveEvidenceItems({
        source,
        metricKeys: selectors,
        constructKeyPrefix: source.instrumentKey,
      }))
    }
    if (slot.unitType === 'SITUATIONAL') {
      const source = (input.situationalSources ?? []).find((row) => row.slotKey === slot.slotKey)
      if (!source) continue
      const selectors = slot.valueSelectors && slot.valueSelectors.length > 0
        ? slot.valueSelectors
        : Object.keys(source.metrics)
      collected.push(...projectSituationalEvidenceItems({ source, metricKeys: selectors }))
    }
  }

  if (input.contextFacts) {
    for (const fact of input.contextFacts.facts) {
      collected.push({
        evidenceKey: `context.${fact.contextKey}`,
        constructKey: `context.${fact.contextKey}`,
        source: {
          kind: 'CONTEXT_FACT',
          contextKey: fact.contextKey,
          contextSnapshotHash: input.contextFacts.contextSnapshotHash,
        },
        value: fact.value,
        quality: fact.value.state === 'present' ? 'interpretable' : 'unavailable',
        criterionBandKey: null,
        role: 'CONTEXT',
      })
    }
  }
  return collected
}

const toEnginePayload = (
  snapshot: FrozenAssessmentBundleSnapshotV3,
  result: { kind: 'COMPUTED'; payload: unknown } | { kind: 'UNAVAILABLE'; reason: string },
): BundleReportEnginePayloadV1 => {
  if (result.kind === 'COMPUTED') {
    return {
      engineKey: snapshot.engine.key,
      engineVersion: snapshot.engine.version,
      kind: 'COMPUTED',
      payload: result.payload,
    }
  }
  return {
    engineKey: snapshot.engine.key,
    engineVersion: snapshot.engine.version,
    kind: 'UNAVAILABLE',
    reason: result.reason,
  }
}

/**
 * Project authoritative BundleReportFacts from a frozen snapshot + engine dispatch.
 */
export const projectBundleReportFacts = (input: {
  registry: BundleAnalysisEngineRegistry
  engineInput: BundleEngineInputV1
  limitations?: string[]
  recommendations?: string[]
}): BundleReportFactsV1 => {
  const { engineInput } = input
  const snapshot = engineInput.snapshot

  // Validate context facts content hash (not only definitionHash) before any engine dispatch.
  const contextFacts = engineInput.contextFacts
    ? validateBundleContextFacts(engineInput.contextFacts)
    : null
  if (contextFacts) {
    assertContextDefinitionHashMatchesSnapshot({
      snapshot,
      contextDefinitionHash: contextFacts.contextDefinitionHash,
    })
    if (snapshot.contextDefinitionHash === null) {
      bundleContractFail('CONTEXT_DEFINITION_VERSION_MISMATCH', 'contextFacts 存在但 snapshot.contextDefinitionHash 为 null')
    }
  }

  const compiledBundleRuntimeHash = engineInput.compiledRuntime.compiledRuntimeHash
  if (typeof compiledBundleRuntimeHash !== 'string' || !/^[0-9a-f]{64}$/.test(compiledBundleRuntimeHash)) {
    bundleContractFail('COMPILED_RUNTIME_HASH', 'compiledRuntime.compiledRuntimeHash 必须是权威小写 SHA-256')
  }

  // Same parsed contextFacts object for Evidence + engine + ReportFacts.
  const normalizedInput = { ...engineInput, contextFacts }
  const evidence = collectEvidenceFromSources(normalizedInput)
  const engineResult = input.registry.dispatch({ ...normalizedInput, evidence })
  const enginePayload = toEnginePayload(snapshot, engineResult)

  const qualityNotes: string[] = []
  if (enginePayload.kind === 'UNAVAILABLE') {
    qualityNotes.push(`engine unavailable: ${enginePayload.reason}`)
  }

  return buildBundleReportFacts({
    schemaVersion: 1,
    factsSchemaVersion: 'bundle-report-facts-v1',
    identity: {
      bundleKey: snapshot.bundleKey,
      bundleVersion: snapshot.bundleVersion,
      engine: { ...snapshot.engine },
      snapshotHash: snapshot.snapshotHash,
    },
    evidence,
    quality: {
      overall: rollupEvidenceQuality(evidence),
      notes: qualityNotes,
    },
    enginePayload,
    limitations: [
      ...(snapshot.bundleDefinition.limitations ?? []),
      ...(input.limitations ?? []),
      'HTML/Markdown 导出非权威；以 BundleReportFactsV1 为准。',
    ],
    recommendations: input.recommendations ?? [],
    contextSnapshotHash: contextFacts?.contextSnapshotHash ?? null,
    provenance: {
      compiledBundleRuntimeHash,
      aggregateInputHash: engineInput.aggregateInputHash,
      contextDefinitionHash: snapshot.contextDefinitionHash,
      ruleSetRef: snapshot.ruleSetRef ? { ...snapshot.ruleSetRef } : null,
    },
  })
}

export interface BundleAudienceProjectionV1 {
  audience: BundleReportAudienceV1
  identity: BundleReportFactsV1['identity']
  quality: BundleReportFactsV1['quality']
  /** Sanitized evidence: CONTEXT_FACT values redacted for student/parent/teacher/admin. */
  evidence: Array<{
    evidenceKey: string
    constructKey: string
    sourceKind: EvidenceItemV1['source']['kind']
    quality: EvidenceQualityStateV1
    criterionBandKey: string | null
    role: EvidenceItemV1['role']
    /** Cognitive/Scale values may be present; CONTEXT_FACT always redacted on this API. */
    value: EvidenceItemV1['value'] | { state: 'redacted' }
  }>
  engineSummary: {
    engineKey: string
    engineVersion: string
    kind: 'COMPUTED' | 'UNAVAILABLE'
    reason?: string
    /** High-level outcome fields only — never full MH feedback dumps for student/parent. */
    outcomeCode?: string | null
    actionTier?: string | null
    domainStatus?: string | null
    reportingMode?: string | null
  }
  limitations: string[]
  recommendations: string[]
  /** Explicitly null — raw answers are never projected. */
  rawAnswers: null
  /** Sensitive context values are never projected to audience views. */
  sensitiveContextValues: null
  contextSnapshotHash: string | null
  provenance: {
    evidenceSourceHashes: string[]
    contextDefinitionHash: string | null
    ruleSetRef: BundleReportFactsV1['provenance']['ruleSetRef']
    snapshotHash: string
  }
}

const summarizeEngine = (
  facts: BundleReportFactsV1,
  audience: BundleReportAudienceV1,
): BundleAudienceProjectionV1['engineSummary'] => {
  const base = {
    engineKey: facts.enginePayload.engineKey,
    engineVersion: facts.enginePayload.engineVersion,
    kind: facts.enginePayload.kind,
  }
  if (facts.enginePayload.kind === 'UNAVAILABLE') {
    return { ...base, reason: facts.enginePayload.reason }
  }
  const payload = facts.enginePayload.payload
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const summary: BundleAudienceProjectionV1['engineSummary'] = { ...base }
  if (typeof record.outcomeCode === 'string') summary.outcomeCode = record.outcomeCode
  if (typeof record.actionTier === 'string') {
    summary.actionTier = audience === 'student' || audience === 'parent'
      ? (record.actionTier === 'SAFETY_ESCALATION' ? 'FOLLOW_UP' : record.actionTier)
      : record.actionTier
  }
  if (typeof record.status === 'string') summary.domainStatus = record.status
  if (typeof record.reportingMode === 'string') summary.reportingMode = record.reportingMode
  return summary
}

export const projectBundleAudienceView = (
  facts: BundleReportFactsV1,
  audience: BundleReportAudienceV1,
): BundleAudienceProjectionV1 => {
  const validated = validateBundleReportFacts(facts)
  const evidence = validated.evidence.map((item) => {
    const sourceKind = item.source.kind
    // Privileged Context read is not this API — redact CONTEXT_FACT for every audience including admin.
    if (sourceKind === 'CONTEXT_FACT') {
      return {
        evidenceKey: item.evidenceKey,
        constructKey: item.constructKey,
        sourceKind,
        quality: item.quality,
        criterionBandKey: null,
        role: item.role,
        value: { state: 'redacted' as const },
      }
    }
    return {
      evidenceKey: item.evidenceKey,
      constructKey: item.constructKey,
      sourceKind,
      quality: item.quality,
      criterionBandKey: item.criterionBandKey,
      role: item.role,
      value: item.value,
    }
  })

  return {
    audience,
    identity: { ...validated.identity, engine: { ...validated.identity.engine } },
    quality: {
      overall: validated.quality.overall,
      notes: [...validated.quality.notes],
    },
    evidence,
    engineSummary: summarizeEngine(validated, audience),
    limitations: [...validated.limitations],
    recommendations: audience === 'student'
      ? validated.recommendations.filter((row) => !/诊断|危机|suicide/i.test(row))
      : [...validated.recommendations],
    rawAnswers: null,
    sensitiveContextValues: null,
    contextSnapshotHash: validated.contextSnapshotHash,
    provenance: {
      evidenceSourceHashes: [...validated.provenance.evidenceSourceHashes],
      contextDefinitionHash: validated.provenance.contextDefinitionHash,
      ruleSetRef: validated.provenance.ruleSetRef
        ? { ...validated.provenance.ruleSetRef }
        : null,
      snapshotHash: validated.identity.snapshotHash,
    },
  }
}

export const projectAllBundleAudienceViews = (
  facts: BundleReportFactsV1,
): Record<BundleReportAudienceV1, BundleAudienceProjectionV1> => ({
  student: projectBundleAudienceView(facts, 'student'),
  parent: projectBundleAudienceView(facts, 'parent'),
  teacher: projectBundleAudienceView(facts, 'teacher'),
  admin: projectBundleAudienceView(facts, 'admin'),
})

/**
 * Non-authoritative HTML export. Must never be treated as the result of record.
 */
export const renderBundleReportHtml = (facts: BundleReportFactsV1): string => {
  const validated = validateBundleReportFacts(facts)
  const title = `${validated.identity.bundleKey}@${validated.identity.bundleVersion}`
  const overall = validated.quality.overall
  const lines = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Bundle Report (non-authoritative)</title></head><body>',
    `<h1>${title}</h1>`,
    '<p><strong>Notice:</strong> This HTML export is not authoritative. Use BundleReportFactsV1.</p>',
    `<p>Quality: ${overall}</p>`,
    `<p>Engine: ${validated.enginePayload.engineKey}@${validated.enginePayload.engineVersion} (${validated.enginePayload.kind})</p>`,
    '<ul>',
    ...validated.limitations.map((row) => `<li>${row.replace(/[<>&]/g, '')}</li>`),
    '</ul>',
    '</body></html>',
  ]
  return lines.join('\n')
}

/**
 * Non-authoritative Markdown export.
 */
export const renderBundleReportMarkdown = (facts: BundleReportFactsV1): string => {
  const validated = validateBundleReportFacts(facts)
  return [
    `# Bundle Report (non-authoritative)`,
    '',
    `> HTML/Markdown exports are **not** the authoritative result. Use \`BundleReportFactsV1\`.`,
    '',
    `- Bundle: \`${validated.identity.bundleKey}@${validated.identity.bundleVersion}\``,
    `- Engine: \`${validated.enginePayload.engineKey}@${validated.enginePayload.engineVersion}\` (${validated.enginePayload.kind})`,
    `- Quality: ${validated.quality.overall}`,
    `- Snapshot: \`${validated.identity.snapshotHash}\``,
    '',
    '## Limitations',
    ...validated.limitations.map((row) => `- ${row}`),
  ].join('\n')
}

export interface BundleHistoricalSnapshotExportV1 {
  schema: 'bundle-historical-snapshot-export-v1'
  authoritative: false
  snapshot: FrozenAssessmentBundleSnapshotV3
  reportFacts: BundleReportFactsV1 | null
  exportedAt: string
  exportHash: string
}

/** Historical frozen snapshot (+ optional facts) export package. */
export const exportHistoricalBundleSnapshot = (input: {
  snapshot: FrozenAssessmentBundleSnapshotV3
  reportFacts?: BundleReportFactsV1 | null
  exportedAt?: string
}): BundleHistoricalSnapshotExportV1 => {
  const snapshot = validateFrozenAssessmentBundleSnapshot(input.snapshot)
  const exportedAt = input.exportedAt ?? new Date().toISOString()
  const reportFacts = input.reportFacts ? validateBundleReportFacts(input.reportFacts) : null
  if (reportFacts) {
    if (
      reportFacts.identity.bundleKey !== snapshot.bundleKey
      || reportFacts.identity.bundleVersion !== snapshot.bundleVersion
      || reportFacts.identity.snapshotHash !== snapshot.snapshotHash
    ) {
      bundleContractFail(
        'HISTORICAL_EXPORT_IDENTITY_MISMATCH',
        'reportFacts 必须精确匹配 snapshot 的 bundleKey/bundleVersion/snapshotHash',
      )
    }
  }
  const body = {
    schema: 'bundle-historical-snapshot-export-v1' as const,
    authoritative: false as const,
    snapshot,
    reportFacts,
    exportedAt,
  }
  return {
    ...body,
    exportHash: canonicalHash(body),
  }
}

export type { BundleContextFactsV1 }
