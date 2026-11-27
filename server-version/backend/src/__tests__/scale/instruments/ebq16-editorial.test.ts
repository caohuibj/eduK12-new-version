import { describe, expect, it } from 'vitest'
import type { ScaleInstrumentSourceV1 } from '../../../modules/scale/onboarding/types'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import rawSource from '../../../modules/scale/instruments/ebq16_zh_cn_research/1.0.3/source.json'

const source = rawSource as unknown as ScaleInstrumentSourceV1
const executable = source.executable!

const result = (responseValue: number, ageMonthsAtFreeze = 360) => buildScaleResult({
  scaleId: 'ebq16-editorial-fixture',
  instrumentKey: source.identity.instrumentKey,
  name: source.catalog.identity.canonicalName,
  instrumentVersion: source.identity.instrumentVersion,
  definition: executable.definition,
  answers: executable.definition.items.map((item) => ({ itemCode: item.itemCode, responseValue: String(responseValue) })),
  referenceSets: executable.references,
  participantContext: { ageMonthsAtFreeze },
})

describe('EBQ-16 1.0.3 editorial report', () => {
  it('is directly approvable as an explicitly labelled production trial version', () => {
    expect(executable.releaseStatus).toBe('PUBLISHED')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
    expect(source.catalog.identity.canonicalName).toContain('中文研究工作译稿')
  })

  it('keeps the exact 16-item, seven-score author scoring contract', () => {
    expect(executable.definition.items).toHaveLength(16)
    expect(executable.definition.responseSets[0].options.map((option) => option.score)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(executable.definition.scoring.scores.map((score) => score.key)).toEqual([
      'neg_controllability',
      'pos_controllability',
      'neg_usefulness',
      'pos_usefulness',
      'general_controllability',
      'general_usefulness',
      'total',
    ])
    expect(result(1).scores.map((score) => [score.key, score.value])).toEqual([
      ['neg_controllability', 4],
      ['pos_controllability', 4],
      ['neg_usefulness', 4],
      ['pos_usefulness', 4],
      ['general_controllability', 8],
      ['general_usefulness', 8],
      ['total', 16],
    ])
    expect(result(7).scores.at(-1)?.value).toBe(112)
  })

  it('binds all trial bands to the exact adult form without empirical claims', () => {
    expect(hashScaleDefinition(executable.definition)).toBe('af6ac774906ea6595d6a29f05a098c603f780211f813569bfb03a18e6d127c22')
    expect(validateScaleInstrumentSource(source).issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(executable.references).toHaveLength(1)
    expect(executable.references[0].entries).toHaveLength(4)
    for (const entry of executable.references[0].entries) {
      expect(entry.evidenceLevel).toBe('theoretical')
      expect(entry.statistics).toEqual({})
      expect(entry.governance?.sampleN).toBeNull()
      expect(entry.governance?.schoolStage).toBe('adult')
    }
  })

  it.each([
    [1, 'low'],
    [3, 'low'],
    [4, 'middle'],
    [5, 'middle'],
    [7, 'high'],
  ] as const)('selects the declared trial band for response %s', (responseValue, bandKey) => {
    const output = result(responseValue)
    expect(output.references).toHaveLength(4)
    expect(output.references.every((reference) => reference.status === 'available')).toBe(true)
    expect(output.references.map((reference) => reference.criterionBand?.key)).toEqual([bandKey, bandKey, bandKey, bandKey])
    const referenced = output.interpretations.filter((interpretation) => interpretation.referenceVersion)
    expect(referenced).toHaveLength(4)
    expect(referenced.every((interpretation) => interpretation.label?.includes('试用量尺'))).toBe(true)
    expect(output.references.every((reference) => reference.percentile === null && reference.z === null)).toBe(true)
  })

  it('does not silently turn missing or school-only context into an adult band', () => {
    const withoutAge = buildScaleResult({
      scaleId: 'ebq16-no-age',
      instrumentKey: source.identity.instrumentKey,
      name: source.catalog.identity.canonicalName,
      instrumentVersion: source.identity.instrumentVersion,
      definition: executable.definition,
      answers: executable.definition.items.map((item) => ({ itemCode: item.itemCode, responseValue: '4' })),
      referenceSets: executable.references,
    })
    expect(withoutAge.references.every((reference) => reference.status === 'unavailable')).toBe(true)
    expect(result(4, 215).references.every((reference) => reference.status === 'unavailable')).toBe(true)

    const missingAnswer = buildScaleResult({
      scaleId: 'ebq16-missing',
      instrumentKey: source.identity.instrumentKey,
      name: source.catalog.identity.canonicalName,
      instrumentVersion: source.identity.instrumentVersion,
      definition: executable.definition,
      answers: executable.definition.items.slice(1).map((item) => ({ itemCode: item.itemCode, responseValue: '4' })),
      referenceSets: executable.references,
      participantContext: { ageMonthsAtFreeze: 360 },
    })
    expect(missingAnswer.quality.status).toBe('invalid')
    expect(missingAnswer.references).toEqual([])
    expect(missingAnswer.interpretations).toEqual([])
  })

  it('keeps the report within this scale and marks the translation and bands as trial content', () => {
    const report = executable.definition.report
    expect(report.reportVersion).toBe('1.3.0')
    expect(report.primaryScoreKeys).toEqual(['general_controllability', 'neg_usefulness', 'pos_usefulness', 'total'])
    expect(report.limitations.join('\n')).toContain('工作稿')
    expect(report.limitations.join('\n')).toContain('试用量尺')
    expect(report.limitations.join('\n')).toContain('七个分数不能再次相加')
    expect(report.disclaimer).toContain('不是诊断、筛查、常模、排名或能力等级')
    expect(JSON.stringify(report)).not.toMatch(/人格|抑郁|焦虑症|智力|学习能力/)
  })
})
