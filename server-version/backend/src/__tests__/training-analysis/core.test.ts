import { describe, expect, it } from 'vitest'
import {
  buildTrainingAnalysis, buildTrainingAnalysisExport, buildTrainingAnalysisTables, buildTrainingDictionary,
  resolveTrainingComparability, trainingAnalysisTableToCsv,
  TRAINING_ANALYSIS_MAX_OBSERVATIONS, TRAINING_ANALYSIS_MAX_COLUMNS,
} from '../../modules/training-analysis/core'
import type {
  TrainingAnalysisRequestV1, TrainingAnalysisSourceV1, TrainingMetricIdentityV1,
  TrainingNumericObservationV1, TrainingObservationReason,
} from '../../modules/training-analysis/types'

const measurement: TrainingMetricIdentityV1 = {
  instrumentKey: 'wellbeing', scoreKey: 'score', scoringDigest: 'a'.repeat(64),
  responseSignature: 'b'.repeat(64), respondentType: 'SELF', unit: 'points', version: '1.0.0',
}
const request = (count = 2): TrainingAnalysisRequestV1 => ({
  schemaVersion: 1, courseId: 'training-course', mode: count === 2 ? 'PAIRWISE' : 'FULL_CASE',
  waves: Array.from({ length: count }, (_, index) => ({
    waveKey: `w${index + 1}`, taskId: `task-${index + 1}`, publication: '2026-10-01T00:00:00.000Z',
    configDigest: null, variantKey: null, metrics: [{ metricKey: 'score', itemId: `item-${index + 1}` }],
  })),
})
const observation = (wave: number, participant: number, value: number | null, reason: TrainingObservationReason | null = null): TrainingNumericObservationV1 => ({
  participantKey: `u${participant}`, participantKind: 'USER', waveKey: `w${wave}`, taskId: `task-${wave}`,
  publication: '2026-10-01T00:00:00.000Z', configDigest: null, variantKey: null,
  attemptId: `attempt-${wave}-${participant}`, attemptEpoch: 1, sourceHashes: { result: 'c'.repeat(64) },
  itemId: `item-${wave}`, metricKey: 'score', measurement: { ...measurement }, value, reason,
  originalFinalStatus: 'COMPLETED', taskSatisfied: true,
})
const source = (count = 5, waveCount = 2): TrainingAnalysisSourceV1 => ({
  schemaVersion: 1, courseId: 'training-course', observations: Array.from({ length: waveCount }, (_, wave) => (
    Array.from({ length: count }, (_, participant) => observation(wave + 1, participant + 1, participant + 2 * wave))
  )).flat(),
})
const failure = (action: () => unknown, code: string, statusCode = 409) => {
  try { action(); expect.fail('Expected explicit rejection') } catch (error) { expect(error).toMatchObject({ code, statusCode }) }
}

describe('Training numeric and matched kernel', () => {
  it('matches hand-calculated five-person complete pairs and Type 7 descriptives, without organization fields', () => {
    const actual = buildTrainingAnalysis(request(), source())
    expect(actual.state).toBe('present')
    expect(actual.minimumN).toBe(5)
    expect(actual.matchedEligibleN).toBe(5)
    expect(actual.descriptives[0]).toMatchObject({ state: 'present', validN: 5, eligibleN: 5,
      missingByReason: {}, statistics: { mean: 2, median: 2, sdSample: Math.sqrt(2.5), minMax: { min: 0, max: 4 }, quartiles: { q1: 1, q2: 2, q3: 3 } } })
    expect(actual.metrics[0]).toMatchObject({ state: 'present', countKind: 'PAIRED_VALID', validCaseN: 5,
      waveMeans: [{ waveId: 'w1', waveKey: 'w1', mean: 2 }, { waveId: 'w2', waveKey: 'w2', mean: 4 }],
      comparisons: [{ fromWaveId: 'w1', toWaveId: 'w2', delta: 2, comparability: { level: 'EXACT' } }],
      flow: [{ state: 'present', fromObservedN: 5, toObservedN: 5, retainedN: 5, attritionN: 0, lateJoiningN: 0 }],
    })
    expect(JSON.stringify(actual)).not.toContain('organizationId')
  })

  it('uses the same complete cases for both means, excluding missing and quality-excluded observations', () => {
    const input = source(7)
    input.observations.find((row) => row.waveKey === 'w2' && row.participantKey === 'u6')!.reason = 'UNANSWERED'
    input.observations.find((row) => row.waveKey === 'w2' && row.participantKey === 'u7')!.reason = 'QUALITY_EXCLUDED'
    const actual = buildTrainingAnalysis(request(), input)
    expect(actual.metrics[0]).toMatchObject({ validCaseN: 5,
      waveMeans: [{ mean: 2 }, { mean: 4 }], comparisons: [{ delta: 2 }], flow: [{ state: 'suppressed' }] })
    expect(actual.matchedEligibleN).toBeUndefined()
    expect(actual.descriptives[0].validN).toBeUndefined()
    expect(actual.descriptives[0].eligibleN).toBeUndefined()
    expect(actual.descriptives[1].eligibleN).toBeUndefined()
    expect(actual.descriptives[1].missingByReason).toBeUndefined()
    const long = buildTrainingAnalysisTables(request(), input).long.rows
    const excluded = long.find((row) => row.waveKey === 'w2' && row.attemptId === 'attempt-2-7')!
    expect(excluded).toMatchObject({ reason: 'QUALITY_EXCLUDED', value: null, originalFinalStatus: 'COMPLETED', taskSatisfied: true })
    expect(input.observations.find((row) => row.waveKey === 'w2' && row.participantKey === 'u7')!.value).toBe(8)
  })

  it('reports safely sized missingness cells and distinguishes every source reason', () => {
    const input = source(10)
    input.observations.filter((row) => row.waveKey === 'w2').slice(5).forEach((row) => { row.reason = 'NOT_ASSIGNED'; row.value = null })
    const actual = buildTrainingAnalysis(request(), input)
    expect(actual.descriptives[1]).toMatchObject({ validN: 5, eligibleN: 10, missingByReason: { NOT_ASSIGNED: 5 } })
    expect(actual.metrics[0]).toMatchObject({ validCaseN: 5, flow: [{ attritionN: 0, lateJoiningN: 0, retainedN: 10, basis: 'OBSERVED_SAMPLE' }] })
  })

  it('keeps full-case selection separate from pairwise and computes adjacent comparisons from the full intersection', () => {
    const input = source(6, 3)
    input.observations.find((row) => row.waveKey === 'w3' && row.participantKey === 'u6')!.reason = 'NON_FINAL'
    const full = buildTrainingAnalysis(request(3), input)
    expect(full.metrics[0]).toMatchObject({ countKind: 'COMPLETE_CASE', validCaseN: 5,
      waveMeans: [{ mean: 2 }, { mean: 4 }, { mean: 6 }], comparisons: [{ delta: 2 }, { delta: 2 }] })
    const pair = buildTrainingAnalysis(request(), { ...input, observations: input.observations.filter((row) => row.waveKey !== 'w3') })
    expect(pair.metrics[0].validCaseN).toBe(6)
    failure(() => buildTrainingAnalysis({ ...request(3), mode: 'PAIRWISE' }, input), 'TRAINING_ANALYSIS_REQUEST_INVALID', 400)
  })

  it('reports safe attrition and late joining without joining on display names or row position', () => {
    const input = source(10)
    input.observations.filter((row) => row.waveKey === 'w2').slice(5).forEach((row, i) => { row.participantKey = `late-${i}`; row.attemptId = `late-attempt-${i}` })
    const actual = buildTrainingAnalysis(request(), input)
    expect(actual.metrics[0]).toMatchObject({ validCaseN: 5, flow: [{ state: 'present', fromObservedN: 10, toObservedN: 10, retainedN: 5, attritionN: 5, lateJoiningN: 5 }] })
  })

  it('does not pair study-local identities with same-spelling user identities', () => {
    const input = source()
    input.observations.filter((row) => row.waveKey === 'w2').forEach((row) => { row.participantKind = 'STUDY_LOCAL' })
    expect(buildTrainingAnalysis(request(), input).metrics[0].state).toBe('suppressed')
  })

  it('requires exact frozen metric identity for numeric delta across every identity field', () => {
    for (const field of ['instrumentKey', 'scoreKey', 'scoringDigest', 'responseSignature', 'respondentType', 'unit', 'version'] as const) {
      const input = source()
      input.observations.filter((row) => row.waveKey === 'w2').forEach((row) => { row.measurement = { ...measurement, [field]: 'changed' } })
      const actual = buildTrainingAnalysis(request(), input)
      expect(actual.descriptives.every((row) => row.state === 'present')).toBe(true)
      expect(actual.metrics[0]).toMatchObject({ state: 'not_comparable', reason: 'NOT_COMPARABLE', comparisons: [{ comparability: { level: 'NOT_COMPARABLE', allowedOperations: ['SIDE_BY_SIDE'] } }] })
      expect(actual.metrics[0].comparisons?.[0]).not.toHaveProperty('delta')
    }
    expect(resolveTrainingComparability('score', null, measurement).level).toBe('NOT_COMPARABLE')
  })

  it('exports explicit incomparable null cells while preserving FINAL status and side-by-side descriptives', () => {
    const input = source()
    input.observations.filter((row) => row.waveKey === 'w2').forEach((row) => { row.measurement!.version = '2.0.0' })
    const analysis = buildTrainingAnalysis(request(), input), tables = buildTrainingAnalysisTables(request(), input)
    expect(analysis.metrics[0].state).toBe('not_comparable')
    expect(analysis.descriptives.map((row) => row.statistics?.mean)).toEqual([2, 4])
    expect(tables.long.rows.every((row) => row.value === null && row.reason === 'NOT_COMPARABLE' && row.originalFinalStatus === 'COMPLETED')).toBe(true)
    const dictionary = buildTrainingDictionary(request(), input)
    expect(tables.wide.rows[0][`${dictionary[0].columnKey}__value`]).toBeNull()
    expect(tables.wide.rows[0][`${dictionary[1].columnKey}__reason`]).toBe('NOT_COMPARABLE')
    expect(input.observations[0].value).toBe(0)
    expect(input.observations[0].reason).toBeNull()
  })

  it('keeps valid numeric export cells when a different Wave has no measurement identity', () => {
    const input = source()
    input.observations.filter((row) => row.waveKey === 'w2').forEach((row) => { row.measurement = null; row.reason = 'NON_FINAL'; row.value = null })
    const rows = buildTrainingAnalysisTables(request(), input).long.rows
    expect(rows.filter((row) => row.waveKey === 'w1').every((row) => row.reason === null && typeof row.value === 'number')).toBe(true)
    expect(rows.filter((row) => row.waveKey === 'w2').every((row) => row.reason === 'NON_FINAL' && row.value === null)).toBe(true)
  })

  it('rejects mixed measurement versions inside a selected Wave instead of pooling', () => {
    const input = source(); input.observations[0].measurement!.version = '2.0.0'
    failure(() => buildTrainingAnalysis(request(), input), 'TRAINING_ANALYSIS_MIXED_MEASUREMENT')
  })

  it('rejects duplicate participant × Wave × metric instead of latest-selection, including export cells', () => {
    const input = source(); input.observations.push({ ...input.observations[0], attemptId: 'later-attempt' })
    failure(() => buildTrainingAnalysis(request(), input), 'AMBIGUOUS_OBSERVATION')
    failure(() => buildTrainingAnalysisTables(request(), input), 'AMBIGUOUS_OBSERVATION')
  })

  it('rejects relabeling a source as multiple timepoints, including aliases with different publications', () => {
    const selected = request(); selected.waves[1] = { ...selected.waves[0], waveKey: 'post' }
    failure(() => buildTrainingAnalysis(selected, source()), 'TRAINING_ANALYSIS_WAVE_ALIAS')
    const input = source(); const selected2 = request()
    selected2.waves[1] = { ...selected2.waves[1], taskId: 'task-1', publication: '2026-10-02T00:00:00.000Z', metrics: [{ metricKey: 'score', itemId: 'item-1' }] }
    input.observations.filter((row) => row.waveKey === 'w2').forEach((row, i) => { row.taskId = 'task-1'; row.publication = selected2.waves[1].publication; row.itemId = 'item-1'; row.attemptId = `attempt-1-${i + 1}` })
    failure(() => buildTrainingAnalysis(selected2, input), 'TRAINING_ANALYSIS_OBSERVATION_ALIAS')
  })

  it('does not pool another publication, configuration or variant into a selected stratum', () => {
    for (const change of [{ publication: 'changed' }, { configDigest: 'd'.repeat(64), variantKey: 'B' }]) {
      const input = source(); Object.assign(input.observations[0], change)
      failure(() => buildTrainingAnalysis(request(), input), 'TRAINING_ANALYSIS_SOURCE_INVALID')
    }
  })

  it('reapplies the fixed five-person floor to matched cases and honors a higher frozen source floor', () => {
    expect(buildTrainingAnalysis(request(), source(4)).metrics[0]).toMatchObject({ state: 'suppressed' })
    const input = source(6); input.observations[0].minimumN = 7
    const actual = buildTrainingAnalysis(request(), input)
    expect(actual.minimumN).toBe(7)
    expect(actual.metrics[0].state).toBe('suppressed')
    expect(actual.descriptives[0].state).toBe('suppressed')
  })

  it('handles zero FINALs and empty authorized populations without fabricated zero means', () => {
    const input = source()
    input.observations.forEach((row) => { row.reason = 'NON_FINAL'; row.value = null; row.originalFinalStatus = 'IN_PROGRESS' })
    const actual = buildTrainingAnalysis(request(), input)
    expect(actual.state).toBe('suppressed')
    expect(actual.metrics[0].waveMeans).toBeUndefined()
    expect(actual.descriptives.every((row) => row.state === 'suppressed')).toBe(true)
    const empty = buildTrainingAnalysis(request(), { ...input, observations: [] })
    expect(empty.state).toBe('suppressed')
    expect(empty.matchedEligibleN).toBeUndefined()
    expect(buildTrainingDictionary(request(), { ...input, observations: [] })).toHaveLength(2)
  })

  it('normalizes nonfinite input to an explicit invalid-value reason and rejects finite arithmetic overflow', () => {
    const input = source(6); input.observations[0].value = Infinity
    expect(buildTrainingAnalysisTables(request(), input).long.rows[0]).toMatchObject({ value: null, reason: 'INVALID_VALUE' })
    expect(buildTrainingAnalysis(request(), input).metrics[0].validCaseN).toBe(5)
    const overflowing = source(); overflowing.observations.forEach((row) => { row.value = Number.MAX_VALUE })
    failure(() => buildTrainingAnalysis(request(), overflowing), 'REPORT_STATISTIC_OVERFLOW', 500)
  })

  it('is byte-stable under source permutations and leaves input untouched', () => {
    const input = source(); const before = JSON.stringify(input)
    const reverse = { ...input, observations: [...input.observations].reverse() }
    expect(JSON.stringify(buildTrainingAnalysis(request(), input))).toBe(JSON.stringify(buildTrainingAnalysis(request(), reverse)))
    for (const format of ['LONG', 'WIDE', 'CODEBOOK'] as const) {
      expect(buildTrainingAnalysisExport(request(), input, format).csv).toBe(buildTrainingAnalysisExport(request(), reverse, format).csv)
    }
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('Training longitudinal research tables', () => {
  it('keeps exact provenance and distinct missing reasons in stable long, wide and dictionary tables', () => {
    const input = source(6)
    const reasons: TrainingObservationReason[] = ['QUALITY_EXCLUDED', 'NOT_COMPARABLE', 'NOT_ASSIGNED', 'UNANSWERED', 'NON_FINAL', 'NOT_ATTEMPTED']
    input.observations.filter((row) => row.waveKey === 'w2').forEach((row, index) => { row.reason = reasons[index]; row.value = null })
    const tables = buildTrainingAnalysisTables(request(), input), dictionary = buildTrainingDictionary(request(), input)
    expect(tables.long.rows).toHaveLength(12)
    expect(tables.wide.rows).toHaveLength(6)
    expect(tables.dictionary.rows).toHaveLength(2)
    expect(tables.long.rows.find((row) => row.waveKey === 'w2')?.reason).toBe('QUALITY_EXCLUDED')
    expect(tables.wide.rows.map((row) => row[`${dictionary[1].columnKey}__reason`])).toEqual(reasons)
    expect(tables.dictionary.rows[0]).toMatchObject({ taskId: 'task-1', valueType: 'NUMBER', version: '1.0.0', scoringDigest: measurement.scoringDigest })
    expect(tables.long.rows[0].sourceHashes).toBe('{"result":"' + 'c'.repeat(64) + '"}')
    expect(tables.wide.rows[0][`${dictionary[0].columnKey}__sourceHashes`]).toBe(tables.long.rows[0].sourceHashes)
  })

  it('uses the same bounded dense observed-participant grid for long and wide, with explicit NO_OBSERVATION', () => {
    const input = source()
    input.observations = input.observations.filter((row) => !(row.waveKey === 'w2' && row.participantKey === 'u5'))
    const tables = buildTrainingAnalysisTables(request(), input), dictionary = buildTrainingDictionary(request(), input)
    expect(tables.long.rows).toHaveLength(10)
    expect(tables.wide.rows).toHaveLength(5)
    const absent = tables.long.rows.find((row) => row.waveKey === 'w2' && row.reason === 'NO_OBSERVATION')!
    expect(absent).toMatchObject({ value: null, attemptId: null, attemptEpoch: null, originalFinalStatus: null, taskSatisfied: null, sourceHashes: '{}' })
    const corresponding = tables.wide.rows.find((row) => row.participantKey === absent.participantKey)!
    expect(corresponding[`${dictionary[1].columnKey}__reason`]).toBe('NO_OBSERVATION')
    expect(corresponding[`${dictionary[1].columnKey}__sourceHashes`]).toBe('{}')
    expect(input.observations).toHaveLength(9)
    expect(buildTrainingAnalysis(request(), input).metrics[0].state).toBe('suppressed')
  })

  it('exports stable course-scoped pseudonyms rather than internal participant identities', () => {
    const first = buildTrainingAnalysisTables(request(), source())
    expect(first.long.rows[0].participantKey).toMatch(/^p_[0-9a-f]{32}$/)
    expect(first.long.rows[0].participantKey).toBe(first.wide.rows[0].participantKey)
    const other = buildTrainingAnalysisTables({ ...request(), courseId: 'other-course' }, { ...source(), courseId: 'other-course' })
    expect(other.long.rows[0].participantKey).not.toBe(first.long.rows[0].participantKey)
    expect(trainingAnalysisTableToCsv(first.long)).not.toContain('"u1"')
  })

  it('rejects source observations assigned to two participants instead of inflating N', () => {
    const input = source()
    input.observations.push({ ...input.observations[0], participantKey: 'another-user' })
    failure(() => buildTrainingAnalysis(request(), input), 'TRAINING_ANALYSIS_OBSERVATION_ALIAS')
  })

  it('neutralizes spreadsheet formulas after control/space prefixes and correctly quotes commas, quotes and newlines', () => {
    const csv = trainingAnalysisTableToCsv({ columns: ['name', 'value'], rows: [
      { name: '\t =1+1', value: -2 }, { name: '+cmd', value: 'a,"b"\nc' }, { name: '@evil', value: null }, { name: '-string', value: 0 },
    ] })
    expect(csv).toBe('"name","value"\r\n"\'\t =1+1","-2"\r\n"\'+cmd","a,""b""\nc"\r\n"\'@evil",""\r\n"\'-string","0"\r\n')
  })

  it('rejects excess rows, dense cells, columns and duplicate headers before constructing CSV', () => {
    const input = source(); input.observations = Array(TRAINING_ANALYSIS_MAX_OBSERVATIONS + 1).fill(input.observations[0])
    failure(() => buildTrainingAnalysis(request(), input), 'TRAINING_ANALYSIS_LIMIT_EXCEEDED', 413)
    failure(() => trainingAnalysisTableToCsv({ columns: Array.from({ length: TRAINING_ANALYSIS_MAX_COLUMNS + 1 }, (_, i) => String(i)), rows: [] }), 'TRAINING_ANALYSIS_LIMIT_EXCEEDED', 413)
    failure(() => trainingAnalysisTableToCsv({ columns: ['x', 'x'], rows: [] }), 'AMBIGUOUS_OBSERVATION')
    const selected = request(3); selected.waves.forEach((wave) => { wave.metrics = Array.from({ length: 32 }, (_, i) => ({ itemId: `item-${i}`, metricKey: `metric-${i}` })) })
    failure(() => buildTrainingAnalysisTables(selected, { ...source(), observations: [] }), 'TRAINING_ANALYSIS_LIMIT_EXCEEDED', 413)
  })
})
