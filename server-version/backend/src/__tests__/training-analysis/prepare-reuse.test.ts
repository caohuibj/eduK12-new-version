import { describe, expect, it } from 'vitest'
import {
  buildTrainingAnalysis, buildTrainingAnalysisExport, buildTrainingAnalysisTables,
  buildTrainingAnalysisView, buildTrainingDictionary, trainingAnalysisTableToCsv,
} from '../../modules/training-analysis/core'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import type { TrainingAnalysisRequestV1, TrainingAnalysisSourceV1, TrainingNumericObservationV1 } from '../../modules/training-analysis/types'

const fixture = (n = 5, waves = 2) => {
  const request: TrainingAnalysisRequestV1 = { schemaVersion: 1, courseId: 'course', mode: waves === 2 ? 'PAIRWISE' : 'FULL_CASE',
    waves: Array.from({ length: waves }, (_, index) => ({ waveKey: `w${index}`, taskId: `task${index}`,
      publication: '2026-10-01T00:00:00.000Z', configDigest: null, variantKey: null,
      metrics: [{ itemId: `item${index}`, metricKey: 'score' }],
    })),
  }
  const source: TrainingAnalysisSourceV1 = { schemaVersion: 1, courseId: 'course', observations: request.waves.flatMap((wave, index) => (
    Array.from({ length: n }, (_, person): TrainingNumericObservationV1 => ({ participantKind: 'USER', participantKey: `p${person}`,
      waveKey: wave.waveKey, taskId: wave.taskId, publication: wave.publication, configDigest: null, variantKey: null,
      itemId: wave.metrics[0].itemId, metricKey: 'score', attemptId: `a${index}-${person}`, attemptEpoch: 1,
      sourceHashes: { result: 'a'.repeat(64) }, value: person + index * 2, reason: null,
      measurement: { instrumentKey: 'scale', scoreKey: 'score', scoringDigest: 'b'.repeat(64), responseSignature: 'c'.repeat(64),
        respondentType: 'SELF', unit: 'score', version: '1.0.0' }, originalFinalStatus: 'COMPLETED', taskSatisfied: true,
    }))
  )) }
  return { request, source }
}
const errorIdentity = (fn: () => unknown) => {
  try { fn(); return null } catch (error) { const e = error as Error & { code?: string; statusCode?: number }; return { name: e.name, code: e.code, statusCode: e.statusCode, message: e.message } }
}
const equalOutputs = (request: TrainingAnalysisRequestV1, source: TrainingAnalysisSourceV1) => {
  const view = buildTrainingAnalysisView(request, source)
  expect(view.analysis).toEqual(buildTrainingAnalysis(request, source))
  expect(view.dictionary).toEqual(buildTrainingDictionary(request, source))
  expect(view.tables).toEqual(buildTrainingAnalysisTables(request, source))
  for (const [name, format] of [['long', 'LONG'], ['wide', 'WIDE'], ['dictionary', 'CODEBOOK']] as const) {
    expect(trainingAnalysisTableToCsv(view.tables[name])).toBe(buildTrainingAnalysisExport(request, source, format).csv)
  }
  expect(canonicalHash({ analysis: view.analysis, dictionary: view.dictionary })).toBe(canonicalHash({
    analysis: buildTrainingAnalysis(request, source), dictionary: buildTrainingDictionary(request, source),
  }))
  return view
}

describe('Request-local Training analysis prepare reuse', () => {
  it.each([1, 4, 5])('keeps exact outputs and the independent N=%i suppression boundary', n => {
    const { request, source } = fixture(n), view = equalOutputs(request, source)
    expect(view.analysis.state).toBe(n < 5 ? 'suppressed' : 'present')
    if (n < 5) {
      for (const value of [...view.analysis.descriptives, ...view.analysis.metrics]) {
        expect(value).not.toHaveProperty('validN'); expect(value).not.toHaveProperty('validCaseN'); expect(value).not.toHaveProperty('statistics')
      }
    } else {
      expect(view.analysis.metrics[0]).toMatchObject({ validCaseN: 5, waveMeans: [{ mean: 2 }, { mean: 4 }], comparisons: [{ delta: 2 }] })
    }
  })

  it('preserves full-case, missingness, quality exclusion, and non-comparability semantics', () => {
    for (const mode of ['full-case', 'missing', 'quality', 'incomparable'] as const) {
      const { request, source } = fixture(7, mode === 'full-case' ? 3 : 2)
      if (mode === 'missing' || mode === 'quality') {
        source.observations[8].reason = mode === 'quality' ? 'QUALITY_EXCLUDED' : 'UNANSWERED'
        source.observations[8].value = null
      }
      if (mode === 'incomparable') for (const row of source.observations.filter(row => row.waveKey === 'w1')) row.measurement!.scoringDigest = 'd'.repeat(64)
      const before = structuredClone({ request, source }), view = equalOutputs(request, source)
      if (mode === 'incomparable') expect(view.analysis.metrics[0].state).toBe('not_comparable')
      expect({ request, source }).toEqual(before)
    }
  })

  it('performs one validation pass and never prepares again for dictionary or repeated lazy tables', () => {
    const { request, source } = fixture(), observations = source.observations
    let reads = 0
    Object.defineProperty(source, 'observations', { get() { reads++; return observations } })
    buildTrainingDictionary(request, source); const onePrepareReads = reads; reads = 0
    const view = buildTrainingAnalysisView(request, source)
    expect(reads).toBe(onePrepareReads)
    expect(Object.keys(view).sort()).toEqual(['analysis', 'dictionary', 'tables'])
    const before = reads, first = view.tables
    expect(view.tables).toBe(first); expect(reads).toBe(before)
    expect(view.dictionary).toHaveLength(2)
  })

  it('does not leak prepared state through inputs, output objects, or a second request', () => {
    const { request, source } = fixture(), expected = buildTrainingAnalysisTables(request, source)
    const view = buildTrainingAnalysisView(request, source)
    source.observations[0].measurement!.unit = 'caller-change'
    source.observations[0].sourceHashes.result = 'e'.repeat(64)
    source.observations[0].value = 999
    request.waves[0].metrics[0].itemId = 'caller-change'
    view.dictionary[0].measurement!.scoreKey = 'returned-change'
    view.dictionary[0].missingReasons.push('NO_OBSERVATION')
    view.analysis.descriptives[0].measurement!.instrumentKey = 'returned-change'
    expect(view.tables).toEqual(expected)
    const second = fixture(1), other = buildTrainingAnalysisView(second.request, second.source)
    expect(other.analysis.state).toBe('suppressed'); expect(other.tables).not.toBe(view.tables)
    expect(other.dictionary[0].measurement!.scoreKey).toBe('score')
  })

  it('keeps all public entry points and the combined entry equally strict for invalid frozen identities', () => {
    const changes: Array<(f: ReturnType<typeof fixture>) => void> = [
      f => { f.source.courseId = 'foreign-course' },
      f => { f.source.observations[0].publication = '2026-10-02T00:00:00.000Z' },
      f => { f.source.observations[0].measurement!.scoringDigest = 'd'.repeat(64) },
      f => { f.source.observations[0].reason = 'UNKNOWN' as never },
      f => { f.source.observations.push({ ...f.source.observations[0] }) },
      f => { f.source.observations[0].sourceHashes.result = 'invalid' },
      f => { f.source.observations = Array(50_001).fill(f.source.observations[0]) },
    ]
    for (const change of changes) {
      const f = fixture(); change(f)
      const expected = errorIdentity(() => buildTrainingAnalysis(f.request, f.source)); expect(expected).not.toBeNull()
      for (const call of [() => buildTrainingDictionary(f.request, f.source), () => buildTrainingAnalysisTables(f.request, f.source),
        () => buildTrainingAnalysisExport(f.request, f.source, 'LONG'), () => buildTrainingAnalysisView(f.request, f.source)]) expect(errorIdentity(call)).toEqual(expected)
    }
  })
})
