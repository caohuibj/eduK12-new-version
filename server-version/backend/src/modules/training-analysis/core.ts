import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { buildMatchedNumericProjection, selectMatchedNumericCases, type MatchedNumericWaveV1 } from '../reporting/matched'
import { finiteReportingNumber, reportingAggregations } from '../reporting/statistics'
import { reportingFail, type ReportingComparabilityDecisionV1 } from '../reporting/types'
import type {
  TrainingAnalysisDictionaryColumnV1, TrainingAnalysisExportFormat, TrainingAnalysisExportV1,
  TrainingAnalysisProjectionV1, TrainingAnalysisRequestV1, TrainingAnalysisSourceV1,
  TrainingAnalysisTableV1, TrainingAnalysisTablesV1, TrainingAnalysisWaveV1,
  TrainingDescriptiveMetricV1, TrainingMatchedMetricV1, TrainingMetricIdentityV1,
  TrainingNumericObservationV1, TrainingNumericStatisticsV1, TrainingObservationReason,
} from './types'

export const TRAINING_ANALYSIS_MINIMUM_N = 5
export const TRAINING_ANALYSIS_MAX_OBSERVATIONS = 50_000
export const TRAINING_ANALYSIS_MAX_PARTICIPANTS = 10_000
export const TRAINING_ANALYSIS_MAX_COLUMNS = 512
export const TRAINING_ANALYSIS_MAX_WAVES = 8
export const TRAINING_ANALYSIS_MAX_METRICS_PER_WAVE = 32
export const TRAINING_ANALYSIS_REASONS: TrainingObservationReason[] = [
  'QUALITY_EXCLUDED', 'NOT_COMPARABLE', 'NOT_ASSIGNED', 'UNANSWERED', 'NON_FINAL',
  'NOT_ATTEMPTED', 'INVALID_VALUE', 'MISSING_SOURCE', 'LEGACY_UNSCOPED', 'IDENTITY_UNAVAILABLE', 'NO_OBSERVATION', 'NOT_CALCULABLE',
]
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const tuple = (...parts: unknown[]) => JSON.stringify(parts)
const stableParticipant = (row: TrainingNumericObservationV1) => tuple(row.participantKind, row.participantKey)
const groupKey = (waveKey: string, metricKey: string) => tuple(waveKey, metricKey)
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 500
const fail = (message: string, code = 'TRAINING_ANALYSIS_SOURCE_INVALID', status = 409): never => reportingFail(code, message, status)
const waveScope = (wave: Pick<TrainingAnalysisWaveV1, 'taskId' | 'publication' | 'configDigest' | 'variantKey' | 'materialGroupKey'>) => (
  tuple(wave.taskId, wave.publication, wave.configDigest, wave.variantKey, ...(wave.materialGroupKey === undefined ? [] : [wave.materialGroupKey]))
)
const materialFields = (value: {materialGroupKey?: string}) => value.materialGroupKey === undefined ? {} : {materialGroupKey: value.materialGroupKey}
const validValue = (row: TrainingNumericObservationV1) => row.reason === null ? finiteReportingNumber(row.value) : null
const identityKey = (identity: TrainingMetricIdentityV1) => canonicalHash(identity)
const safeCount = (count: number, floor: number) => count === 0 || count >= floor
const sourceFloor = (rows: TrainingNumericObservationV1[]) => rows.reduce((floor, row) => Math.max(floor, row.minimumN ?? 0), TRAINING_ANALYSIS_MINIMUM_N)

interface PreparedSource {
  rows: TrainingNumericObservationV1[]
  groups: Map<string, TrainingNumericObservationV1[]>
  identities: Map<string, TrainingMetricIdentityV1 | null>
  participants: string[]
  dictionary: TrainingAnalysisDictionaryColumnV1[]
}

/** Reject ambiguous inputs before any statistics or exports. The adapter owns
 * authorization and completeness; this boundary owns numeric and cell identity. */
const prepare = (request: TrainingAnalysisRequestV1, source: TrainingAnalysisSourceV1): PreparedSource => {
  if (request.schemaVersion !== 1 || source.schemaVersion !== 1 || !nonempty(request.courseId)
    || source.courseId !== request.courseId) fail('Training analysis source does not belong to this course')
  if (!['PAIRWISE', 'FULL_CASE'].includes(request.mode) || !Array.isArray(request.waves)
    || request.waves.length < 2 || request.waves.length > TRAINING_ANALYSIS_MAX_WAVES
    || (request.mode === 'PAIRWISE' && request.waves.length !== 2)) fail('Invalid longitudinal Wave selection', 'TRAINING_ANALYSIS_REQUEST_INVALID', 400)
  if (!Array.isArray(source.observations) || source.observations.length > TRAINING_ANALYSIS_MAX_OBSERVATIONS) {
    fail('Training analysis observation limit exceeded', 'TRAINING_ANALYSIS_LIMIT_EXCEEDED', 413)
  }
  const waves = new Map<string, TrainingAnalysisWaveV1>(), scopes = new Set<string>()
  const groups = new Map<string, TrainingNumericObservationV1[]>()
  for (const wave of request.waves) {
    if (![wave.waveKey, wave.taskId, wave.publication].every(nonempty)
      || !(wave.configDigest === null || nonempty(wave.configDigest))
      || !(wave.variantKey === null || nonempty(wave.variantKey))
      || (wave.materialGroupKey !== undefined && (!nonempty(wave.materialGroupKey) || wave.configDigest !== null || wave.variantKey !== null))
      || ((wave.configDigest === null) !== (wave.variantKey === null))) fail('Invalid frozen Wave identity', 'TRAINING_ANALYSIS_REQUEST_INVALID', 400)
    if (waves.has(wave.waveKey) || scopes.has(waveScope(wave))) fail('One source cannot be aliased into multiple timepoints', 'TRAINING_ANALYSIS_WAVE_ALIAS', 409)
    waves.set(wave.waveKey, wave); scopes.add(waveScope(wave))
    if (!Array.isArray(wave.metrics) || wave.metrics.length === 0 || wave.metrics.length > TRAINING_ANALYSIS_MAX_METRICS_PER_WAVE) {
      fail('Invalid metric selection', 'TRAINING_ANALYSIS_REQUEST_INVALID', 400)
    }
    const metrics = new Set<string>()
    for (const metric of wave.metrics) {
      if (!nonempty(metric.metricKey) || !nonempty(metric.itemId)) fail('Metric identity is required', 'TRAINING_ANALYSIS_REQUEST_INVALID', 400)
      if (metrics.has(metric.metricKey)) fail('Duplicate metric selection', 'AMBIGUOUS_OBSERVATION', 409)
      metrics.add(metric.metricKey); groups.set(groupKey(wave.waveKey, metric.metricKey), [])
    }
  }
  const cells = new Set<string>(), aliases = new Map<string, { waveKey: string; participant: string }>(), participants = new Set<string>()
  const measurements = new Map<string, Map<string, TrainingMetricIdentityV1>>()
  const rows: TrainingNumericObservationV1[] = []
  for (const original of source.observations) {
    const wave = waves.get(original.waveKey)
    if (!wave || waveScope(wave) !== waveScope(original)
      || !wave.metrics.some((metric) => metric.metricKey === original.metricKey && metric.itemId === original.itemId)) fail('Observation lies outside the exact selected publication/configuration/variant')
    if (!nonempty(original.participantKey) || !['USER', 'STUDY_LOCAL'].includes(original.participantKind)) fail('Stable authorized participant identity is required')
    if (original.reason !== null && ![...TRAINING_ANALYSIS_REASONS,'RESEARCH_CONSENT_UNKNOWN','RESEARCH_WITHDRAWAL_PENDING','RESEARCH_EXCLUDED','RESEARCH_SCOPE_NOT_COVERED'].includes(original.reason)) fail('Unknown missingness reason')
    if (original.reason === 'NO_OBSERVATION') fail('An export-only absent cell cannot enter the observed source population')
    if (!(original.attemptId === null || nonempty(original.attemptId)) || !(original.attemptEpoch === null
      || (Number.isSafeInteger(original.attemptEpoch) && original.attemptEpoch >= 0))) fail('Invalid source attempt identity')
    if ((original.attemptId === null) !== (original.attemptEpoch === null)) fail('Attempt and epoch must be present together')
    if (original.minimumN !== undefined && (!Number.isSafeInteger(original.minimumN) || original.minimumN < 1)) fail('Invalid frozen source privacy threshold')
    if (!original.sourceHashes || typeof original.sourceHashes !== 'object' || Array.isArray(original.sourceHashes)
      || Object.entries(original.sourceHashes).some(([key, hash]) => !nonempty(key) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash))) fail('Invalid immutable source hashes')
    if (original.measurement !== null) {
      const identity = original.measurement
      if (!identity || ![identity.instrumentKey, identity.scoreKey, identity.scoringDigest, identity.responseSignature,
        identity.respondentType, identity.version].every(nonempty) || !(identity.unit === null || nonempty(identity.unit))) fail('Incomplete metric identity')
    }
    let row = { ...original, sourceHashes: { ...original.sourceHashes } }
    if (row.value !== null && finiteReportingNumber(row.value) === null) row = { ...row, value: null, reason: 'INVALID_VALUE' }
    else if (Object.is(row.value, -0)) row.value = 0
    if (row.reason === null && (row.value === null || row.measurement === null || row.attemptId === null || !Object.keys(row.sourceHashes).length)) fail('Valid numeric observation requires its immutable source, attempt, identity and value')
    const participant = stableParticipant(row), cell = tuple(participant, row.waveKey, row.metricKey)
    if (cells.has(cell)) fail('Duplicate participant × Wave × metric; no latest-attempt selection is allowed', 'AMBIGUOUS_OBSERVATION', 409)
    cells.add(cell); participants.add(participant)
    if (row.attemptId !== null) {
      // Attempts are source observations, never new observations merely because
      // the caller chose another Wave label, participant or metric alias.
      const alias = tuple(row.attemptId, row.attemptEpoch, row.itemId, row.measurement?.scoreKey ?? row.metricKey)
      const previous = aliases.get(alias)
      if (previous && (previous.waveKey !== row.waveKey || previous.participant !== participant)) fail('One observation cannot be reused at two timepoints or assigned to multiple participants', 'TRAINING_ANALYSIS_OBSERVATION_ALIAS', 409)
      aliases.set(alias, { waveKey: row.waveKey, participant })
    }
    const key = groupKey(row.waveKey, row.metricKey)
    groups.get(key)!.push(row)
    if (row.measurement) {
      const identities = measurements.get(key) ?? new Map<string, TrainingMetricIdentityV1>()
      identities.set(identityKey(row.measurement), row.measurement); measurements.set(key, identities)
    }
    rows.push(row)
  }
  if (participants.size > TRAINING_ANALYSIS_MAX_PARTICIPANTS) fail('Training analysis participant limit exceeded', 'TRAINING_ANALYSIS_LIMIT_EXCEEDED', 413)
  const identities = new Map<string, TrainingMetricIdentityV1 | null>()
  for (const key of groups.keys()) {
    const distinct = measurements.get(key)
    if (distinct && distinct.size > 1) fail('A selected Wave metric contains incompatible measurement identities; pooling is forbidden', 'TRAINING_ANALYSIS_MIXED_MEASUREMENT', 409)
    identities.set(key, distinct?.values().next().value ?? null)
  }
  const dictionary: TrainingAnalysisDictionaryColumnV1[] = request.waves.flatMap((wave) => (
    [...wave.metrics].sort((a, b) => compare(a.metricKey, b.metricKey)).map((metric) => ({
      columnKey: `m_${canonicalHash({ waveKey: wave.waveKey, scope: waveScope(wave), ...metric })}`,
      waveKey: wave.waveKey, taskId: wave.taskId, publication: wave.publication,
      configDigest: wave.configDigest, variantKey: wave.variantKey, ...materialFields(wave), ...metric,
      measurement: identities.get(groupKey(wave.waveKey, metric.metricKey))!, valueType: 'NUMBER' as const,
      missingReasons: [...TRAINING_ANALYSIS_REASONS,...(source.observations.some(row=>row.participantKind==='STUDY_LOCAL')?['RESEARCH_CONSENT_UNKNOWN','RESEARCH_WITHDRAWAL_PENDING','RESEARCH_EXCLUDED','RESEARCH_SCOPE_NOT_COVERED'] as TrainingObservationReason[]:[])],
    }))
  ))
  // Wide exports include value, reason, attempt, epoch, immutable hashes and FINAL status
  // for each metric. Bound the dense expansion before allocating it.
  if (2 + dictionary.length * 7 > TRAINING_ANALYSIS_MAX_COLUMNS
    || participants.size * dictionary.length > TRAINING_ANALYSIS_MAX_OBSERVATIONS) {
    fail('Training analysis table dimensions exceed the export budget', 'TRAINING_ANALYSIS_LIMIT_EXCEEDED', 413)
  }
  const order = new Map(request.waves.map((wave, index) => [wave.waveKey, index]))
  rows.sort((a, b) => compare(stableParticipant(a), stableParticipant(b)) || order.get(a.waveKey)! - order.get(b.waveKey)! || compare(a.metricKey, b.metricKey))
  return { rows, groups, identities, participants: [...participants].sort(compare), dictionary }
}

/** Exact identity is evidence only when every frozen measurement component is
 * equal. A human-facing key, matching version label or matching unit alone is
 * never enough. No compatible/linking rule is invented here. */
export const resolveTrainingComparability = (metricKey: string, left: TrainingMetricIdentityV1 | null,
  right: TrainingMetricIdentityV1 | null): ReportingComparabilityDecisionV1 => {
  const exact = left !== null && right !== null && identityKey(left) === identityKey(right)
  return {
    schemaVersion: 1, metricId: metricKey, level: exact ? 'EXACT' : 'NOT_COMPARABLE',
    allowedOperations: exact ? ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA'] : ['SIDE_BY_SIDE'],
    evidenceRef: exact ? 'training:frozen-identical-measurement-v1' : null,
    evidenceHash: exact ? identityKey(left!) : null,
    limitations: exact ? [] : ['FROZEN_MEASUREMENT_IDENTITY_MISMATCH_OR_UNAVAILABLE'],
  }
}
const statistics = (values: number[], floor: number): TrainingNumericStatisticsV1 => reportingAggregations({
  values, aggregations: ['MEAN', 'MEDIAN', 'SD_SAMPLE', 'MIN_MAX', 'QUARTILES'], distributionCellFloor: floor,
}) as unknown as TrainingNumericStatisticsV1

const describe = (column: TrainingAnalysisDictionaryColumnV1, rows: TrainingNumericObservationV1[]): TrainingDescriptiveMetricV1 => {
  const { columnKey: _columnKey, missingReasons: _reasons, valueType: _valueType, ...identity } = column
  const values = rows.map(validValue).filter((value): value is number => value !== null)
  const floor = sourceFloor(rows)
  if (values.length < floor) return { ...identity, state: 'suppressed' }
  const missingByReason: Partial<Record<TrainingObservationReason, number>> = {}
  for (const row of rows) if (row.reason !== null) missingByReason[row.reason] = (missingByReason[row.reason] ?? 0) + 1
  const safeMissingness = Object.values(missingByReason).every((count) => safeCount(count!, floor))
  return {
    ...identity, state: 'present', validN: values.length,
    ...(safeMissingness ? { eligibleN: rows.length, missingByReason } : {}),
    statistics: statistics(values, floor),
  }
}
const flowFor = (waves: MatchedNumericWaveV1[], floor: number, validCaseN?: number): NonNullable<TrainingMatchedMetricV1['flow']> => (
  waves.slice(1).map((right, index) => {
    const left = waves[index]
    const a = new Set(left.observations.map((row) => row.participantKey))
    const b = new Set(right.observations.map((row) => row.participantKey))
    const retainedN = [...a].filter((key) => b.has(key)).length
    const attritionN = a.size - retainedN, lateJoiningN = b.size - retainedN
    const scope = { fromWaveKey: left.waveKey, toWaveKey: right.waveKey, basis: 'OBSERVED_SAMPLE' as const }
    if (a.size < floor || b.size < floor || ![retainedN, attritionN, lateJoiningN].every((count) => safeCount(count, floor))
      || (validCaseN !== undefined && ![a.size - validCaseN, b.size - validCaseN].every((count) => safeCount(count, floor)))) {
      return { ...scope, state: 'suppressed' as const }
    }
    return { ...scope, state: 'present' as const, fromObservedN: a.size, toObservedN: b.size, retainedN, attritionN, lateJoiningN }
  })
)

export const buildTrainingAnalysis = (request: TrainingAnalysisRequestV1, source: TrainingAnalysisSourceV1): TrainingAnalysisProjectionV1 => {
  const prepared = prepare(request, source)
  const floor = sourceFloor(prepared.rows)
  const metricKeys = [...new Set(request.waves.flatMap((wave) => wave.metrics.map((metric) => metric.metricKey)))].sort(compare)
  const metrics: TrainingMatchedMetricV1[] = []
  let matchedEligibleN: number | undefined
  const cohortCounts = new Set<number>()
  let disclosePopulation = true
  for (const metricKey of metricKeys) {
    const waves: MatchedNumericWaveV1[] = request.waves.map((wave) => ({
      waveId: wave.waveKey, waveKey: wave.waveKey,
      observations: (prepared.groups.get(groupKey(wave.waveKey, metricKey)) ?? []).map((row) => ({ participantKey: stableParticipant(row), value: validValue(row) })),
    }))
    const countKind = request.mode === 'PAIRWISE' ? 'PAIRED_VALID' as const : 'COMPLETE_CASE' as const
    const decisions = request.waves.slice(1).map((wave, index) => resolveTrainingComparability(metricKey,
      prepared.identities.get(groupKey(request.waves[index].waveKey, metricKey)) ?? null,
      prepared.identities.get(groupKey(wave.waveKey, metricKey)) ?? null))
    if (decisions.some((decision) => decision.level !== 'EXACT')) {
      disclosePopulation = false
      metrics.push({ metricKey, state: 'not_comparable', countKind, reason: 'NOT_COMPARABLE',
        comparisons: decisions.map((comparability, index) => ({
          fromWaveId: waves[index].waveId, toWaveId: waves[index + 1].waveId, comparability,
        })) })
      continue
    }
    const selected = selectMatchedNumericCases(waves)
    // Do not publish a population total from which a hidden small excluded set
    // can be recovered by subtraction from the displayed valid-case count.
    cohortCounts.add(selected.matchedEligibleN)
    if (!safeCount(selected.matchedEligibleN - selected.cases.length, floor)
      || selected.matchedEligibleN < floor || selected.cases.length < floor) disclosePopulation = false
    const projection = buildMatchedNumericProjection({
      waves, mode: request.mode, minimumCohortN: floor, minimumContributorN: floor,
      comparability: (left) => decisions[request.waves.findIndex((wave) => wave.waveKey === left.waveId)],
    })
    metrics.push({ metricKey, ...projection, countKind, flow: flowFor(waves, floor, projection.validCaseN) })
  }
  if (disclosePopulation && cohortCounts.size === 1) matchedEligibleN = [...cohortCounts][0]
  const descriptives = prepared.dictionary.map((column) => describe(column, prepared.groups.get(groupKey(column.waveKey, column.metricKey))!))
  // Complementary count suppression: hiding an attrition row alone is not
  // sufficient if its small size can be reconstructed from another visible N.
  for (const descriptive of descriptives) {
    const matched = metrics.find((metric) => metric.metricKey === descriptive.metricKey)
    if (matched?.validCaseN !== undefined && [descriptive.validN, descriptive.eligibleN]
      .some((count) => count !== undefined && !safeCount(count - matched.validCaseN!, floor))) {
      delete descriptive.validN; delete descriptive.eligibleN; delete descriptive.missingByReason
    }
  }
  return {
    schemaVersion: 1, kind: 'TRAINING_NUMERIC_LONGITUDINAL', courseId: request.courseId,
    mode: request.mode, minimumN: floor, state: metrics.some((metric) => metric.state === 'present') ? 'present' : 'suppressed',
    ...(matchedEligibleN === undefined ? {} : { matchedEligibleN }),
    descriptives,
    metrics, limitations: ['DESCRIPTIVE_RESEARCH_ONLY', 'NO_CAUSAL_OR_DIAGNOSTIC_INTERPRETATION', 'UNIQUE_OR_REJECT', 'NO_CROSS_STRATUM_POOLING'],
  }
}

export const buildTrainingDictionary = (request: TrainingAnalysisRequestV1, source: TrainingAnalysisSourceV1): TrainingAnalysisDictionaryColumnV1[] => prepare(request, source).dictionary

const identityFields = (measurement: TrainingMetricIdentityV1 | null) => ({
  instrumentKey: measurement?.instrumentKey ?? null, scoreKey: measurement?.scoreKey ?? null,
  scoringDigest: measurement?.scoringDigest ?? null, responseSignature: measurement?.responseSignature ?? null,
  respondentType: measurement?.respondentType ?? null, unit: measurement?.unit ?? null, version: measurement?.version ?? null,
})
const LONG_COLUMNS = ['participantKind', 'participantKey', 'waveKey', 'taskId', 'publication', 'configDigest', 'variantKey',
  'itemId', 'metricKey', 'columnKey', 'attemptId', 'attemptEpoch', 'originalFinalStatus', 'taskSatisfied', 'sourceHashes',
  'instrumentKey', 'scoreKey', 'scoringDigest', 'responseSignature', 'respondentType', 'unit', 'version', 'value', 'reason']
const DICTIONARY_COLUMNS = ['columnKey', 'waveKey', 'taskId', 'publication', 'configDigest', 'variantKey', 'itemId', 'metricKey',
  'valueType', 'instrumentKey', 'scoreKey', 'scoringDigest', 'responseSignature', 'respondentType', 'unit', 'version', 'missingReasons']
const WIDE_SUFFIXES = ['value', 'reason', 'attemptId', 'attemptEpoch', 'originalFinalStatus', 'taskSatisfied', 'sourceHashes'] as const

const exportParticipantKey = (courseId: string, participantKind: string, participantKey: string) => (
  `p_${canonicalHash({ schemaVersion: 1, courseId, participantKind, participantKey }).slice(0, 32)}`
)

/** Tables are for the separately authorized research-export surface. Participant
 * identifiers are course-scoped pseudonyms; retained attempt provenance means
 * this is pseudonymization, not an assertion of absolute de-identification. */
export const buildTrainingAnalysisTables = (request: TrainingAnalysisRequestV1, source: TrainingAnalysisSourceV1): TrainingAnalysisTablesV1 => {
  const prepared = prepare(request, source)
  const materialColumns = request.waves.some(wave => wave.materialGroupKey !== undefined) ? ['materialGroupKey'] : []
  const columns = new Map(prepared.dictionary.map((column) => [groupKey(column.waveKey, column.metricKey), column]))
  const metricIdentities = new Map<string, Set<string>>()
  for (const column of prepared.dictionary) if (column.measurement !== null) {
    const identities = metricIdentities.get(column.metricKey) ?? new Set<string>()
    identities.add(identityKey(column.measurement)); metricIdentities.set(column.metricKey, identities)
  }
  // Preserve the accepted source, but never export incomparable or excluded
  // numbers as if they were valid longitudinal cells. Lack of a comparison
  // alone does not turn a valid single-Wave numeric cell into NOT_COMPARABLE.
  const observedExportRows = prepared.rows.map((row) => row.reason !== null ? { ...row, value: null }
    : (metricIdentities.get(row.metricKey)?.size ?? 0) > 1 ? { ...row, value: null, reason: 'NOT_COMPARABLE' as const } : row)

  const byParticipant = new Map<string, Map<string, TrainingNumericObservationV1>>()
  for (const row of observedExportRows) {
    const key = stableParticipant(row), cells = byParticipant.get(key) ?? new Map<string, TrainingNumericObservationV1>()
    cells.set(groupKey(row.waveKey, row.metricKey), row); byParticipant.set(key, cells)
  }
  // Dense export cells use only the union of actually observed participants.
  // Absence is not evidence of recruitment, invitation or failed completion.
  const exportRows = prepared.participants.flatMap((participant) => {
    const [participantKind, participantKey] = JSON.parse(participant) as [TrainingNumericObservationV1['participantKind'], string]
    return prepared.dictionary.map((column): TrainingNumericObservationV1 => {
      const observed = byParticipant.get(participant)!.get(groupKey(column.waveKey, column.metricKey))
      if (observed) return observed
      return {
        participantKind, participantKey, waveKey: column.waveKey, taskId: column.taskId,
        publication: column.publication, configDigest: column.configDigest, variantKey: column.variantKey, ...materialFields(column),
        metricKey: column.metricKey, itemId: column.itemId, measurement: column.measurement,
        attemptId: null, attemptEpoch: null, sourceHashes: {}, originalFinalStatus: null,
        taskSatisfied: null, value: null, reason: 'NO_OBSERVATION',
      }
    })
  })
  const long: TrainingAnalysisTableV1 = { columns: [...LONG_COLUMNS, ...materialColumns], rows: exportRows.map((row) => ({
    participantKind: row.participantKind, participantKey: exportParticipantKey(request.courseId, row.participantKind, row.participantKey), waveKey: row.waveKey, taskId: row.taskId,
    publication: row.publication, configDigest: row.configDigest, variantKey: row.variantKey, ...materialFields(row),
    itemId: row.itemId, metricKey: row.metricKey, columnKey: columns.get(groupKey(row.waveKey, row.metricKey))!.columnKey,
    attemptId: row.attemptId, attemptEpoch: row.attemptEpoch,
    originalFinalStatus: row.originalFinalStatus ?? null, taskSatisfied: row.taskSatisfied ?? null,
    sourceHashes: canonicalJsonString(row.sourceHashes), ...identityFields(row.measurement), value: row.value, reason: row.reason,
  })) }
  const wide: TrainingAnalysisTableV1 = {
    columns: ['participantKind', 'participantKey', ...prepared.dictionary.flatMap((column) => WIDE_SUFFIXES.map((suffix) => `${column.columnKey}__${suffix}`))],
    rows: prepared.participants.map((participant) => {
      const [participantKind, participantKey] = JSON.parse(participant) as [string, string]
      const row: Record<string, unknown> = { participantKind, participantKey: exportParticipantKey(request.courseId, participantKind, participantKey) }
      for (const column of prepared.dictionary) {
        const observation = byParticipant.get(participant)!.get(groupKey(column.waveKey, column.metricKey))
        for (const suffix of WIDE_SUFFIXES) {
          row[`${column.columnKey}__${suffix}`] = observation
            ? suffix === 'sourceHashes' ? canonicalJsonString(observation.sourceHashes) : observation[suffix] ?? null
            : suffix === 'reason' ? 'NO_OBSERVATION' : suffix === 'sourceHashes' ? '{}' : null
        }
      }
      return row
    }),
  }
  const dictionary: TrainingAnalysisTableV1 = { columns: [...DICTIONARY_COLUMNS, ...materialColumns], rows: prepared.dictionary.map((column) => ({
    columnKey: column.columnKey, waveKey: column.waveKey, taskId: column.taskId, publication: column.publication,
    configDigest: column.configDigest, variantKey: column.variantKey, ...materialFields(column), itemId: column.itemId, metricKey: column.metricKey,
    valueType: column.valueType, ...identityFields(column.measurement), missingReasons: canonicalJsonString(column.missingReasons),
  })) }
  return { long, wide, dictionary }
}

export const trainingAnalysisTableToCsv = (table: TrainingAnalysisTableV1): string => {
  if (table.rows.length > TRAINING_ANALYSIS_MAX_OBSERVATIONS || table.columns.length > TRAINING_ANALYSIS_MAX_COLUMNS) fail('Training CSV exceeds bounded export dimensions', 'TRAINING_ANALYSIS_LIMIT_EXCEEDED', 413)
  if (new Set(table.columns).size !== table.columns.length) fail('Duplicate export columns', 'AMBIGUOUS_OBSERVATION', 409)
  const cell = (value: unknown) => {
    if (typeof value === 'number' && finiteReportingNumber(value) === null) fail('CSV numeric values must be finite')
    let text = value === null || value === undefined ? '' : String(value)
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  return [table.columns, ...table.rows.map((row) => table.columns.map((column) => row[column]))]
    .map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
export const buildTrainingAnalysisExport = (request: TrainingAnalysisRequestV1, source: TrainingAnalysisSourceV1,
  format: TrainingAnalysisExportFormat): TrainingAnalysisExportV1 => {
  const tables = buildTrainingAnalysisTables(request, source)
  if (!['LONG', 'WIDE', 'CODEBOOK'].includes(format)) fail('Unsupported export format', 'TRAINING_ANALYSIS_REQUEST_INVALID', 400)
  const table = format === 'LONG' ? tables.long : format === 'WIDE' ? tables.wide : tables.dictionary
  return { schemaVersion: 1, format, rowCount: table.rows.length, columnCount: table.columns.length,
    csv: trainingAnalysisTableToCsv(table), dictionary: prepare(request, source).dictionary }
}
