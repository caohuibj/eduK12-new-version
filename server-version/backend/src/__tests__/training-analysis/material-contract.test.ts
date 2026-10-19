import {describe, expect, it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {assertTrainingManifest, parseTrainingAnalysisSelector, trainingManifestHash} from '../../modules/training-analysis/manifest'
import {buildTrainingAnalysisTables, trainingAnalysisTableToCsv} from '../../modules/training-analysis/core'
import {manifest, selector} from './export-fixtures'
import type {TrainingAnalysisRequestV1, TrainingNumericObservationV1} from '../../modules/training-analysis/types'

describe('material selector schema and immutable manifest', () => {
  it('preserves legacy selector and manifest bytes with the optional field absent', () => {
    expect(parseTrainingAnalysisSelector(selector)).toEqual(selector)
    expect(assertTrainingManifest(manifest())).toEqual(manifest())
    expect(JSON.stringify(assertTrainingManifest(manifest()))).not.toContain('materialGroupKey')
  })
  it('includes group in source alias detection and rejects duplicate group aliases', () => {
    const waves = ['a', 'b'].map((group, index) => ({...selector.waves[0], waveKey: `wave${index}`, materialGroupKey: group}))
    expect(parseTrainingAnalysisSelector({...selector, waves}).waves.map(wave => wave.materialGroupKey)).toEqual(['a', 'b'])
    waves[1].materialGroupKey = 'a'
    expect(() => parseTrainingAnalysisSelector({...selector, waves})).toThrow(/同一测量来源/)
  })
  it.each([null, '', 2])('rejects invalid optional group %s', materialGroupKey => {
    expect(() => parseTrainingAnalysisSelector({...selector, waves: selector.waves.map(wave => ({...wave, materialGroupKey}))})).toThrow()
  })
  it('binds optional group in selector, source manifest and dictionary without introducing a new version', () => {
    const value = manifest()
    value.selector.waves.forEach(wave => {wave.materialGroupKey = 'a'})
    value.sources.forEach(row => {row.materialGroupKey = 'a'})
    value.dictionary = value.selector.waves.map(wave => ({columnKey: `column_${wave.waveKey}`, waveKey: wave.waveKey,
      taskId: wave.taskId, publication: wave.publication, configDigest: null, variantKey: null, materialGroupKey: 'a',
      ...wave.metrics[0], measurement: null, valueType: 'NUMBER', missingReasons: []}))
    value.definitionHash = canonicalHash(value.selector); value.sourceHash = canonicalHash(value.sources)
    const {manifestHash: _old, ...unsigned} = value
    value.manifestHash = trainingManifestHash(unsigned)
    expect(assertTrainingManifest(value)).toEqual(value)
    value.sources[0].materialGroupKey = 'b'
    expect(() => assertTrainingManifest(value)).toThrow(/完整性/)
  })
})

describe('material long CSV and dictionary exports', () => {
  it('exports group for observed and dense missing cells while keeping ordinary variant fields null', () => {
    const request: TrainingAnalysisRequestV1 = {...selector, waves: selector.waves.map((wave, index) => ({...wave, materialGroupKey: index ? 'b' : 'a'}))}
    const wave = request.waves[0]
    const observation: TrainingNumericObservationV1 = {...wave, ...wave.metrics[0], participantKey: 'user:one', participantKind: 'USER',
      attemptId: 'attempt', attemptEpoch: 1, sourceHashes: {result: 'a'.repeat(64)}, measurement: null, value: null, reason: 'UNANSWERED'}
    const tables = buildTrainingAnalysisTables(request, {schemaVersion: 1, courseId: selector.courseId, observations: [observation]})
    expect(tables.long.rows.map(row => [row.materialGroupKey, row.variantKey, row.configDigest, row.reason])).toEqual([
      ['a', null, null, 'UNANSWERED'], ['b', null, null, 'NO_OBSERVATION'],
    ])
    expect(tables.dictionary.rows.map(row => row.materialGroupKey)).toEqual(['a', 'b'])
    expect(trainingAnalysisTableToCsv(tables.long).split('\r\n')[0]).toContain('"materialGroupKey"')
    expect(trainingAnalysisTableToCsv(tables.long)).toContain('"NO_OBSERVATION","b"')
  })
})
