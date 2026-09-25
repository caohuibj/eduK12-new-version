import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE } from '../../../modules/scale/instruments/tipi_zh_cn/1.0.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(SCALE_INSTRUMENT_SOURCE)!

describe('TIPI Chinese standard 7-point instrument package', () => {
  it('passes source/package validation as a PILOT package', () => {
    expect(validateScaleInstrumentSource(SCALE_INSTRUMENT_SOURCE).valid).toBe(true)
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(SCALE_INSTRUMENT_SOURCE.catalog.scientificMaturity).toBe('PILOT')
    expect(SCALE_INSTRUMENT_SOURCE.executable?.releaseStatus).toBe('PUBLISHED')
    expect(SCALE_INSTRUMENT_SOURCE.scientificReview).toBeUndefined()
  })

  it('uses the canonical ten-item order and standard seven-point response format', () => {
    const definition = pkg.definition
    expect(definition.items).toHaveLength(10)
    expect(definition.responseSets).toHaveLength(1)
    expect(definition.responseSets[0]?.options.map((option) => option.score)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(definition.responseSets[0]?.options.map((option) => option.label)).toEqual([
      '非常不同意',
      '比较不同意',
      '有点不同意',
      '既不同意也不反对',
      '有点同意',
      '比较同意',
      '非常同意',
    ])
    expect(definition.items.map((item) => item.itemCode)).toEqual([
      'TIPI-01',
      'TIPI-02',
      'TIPI-03',
      'TIPI-04',
      'TIPI-05',
      'TIPI-06',
      'TIPI-07',
      'TIPI-08',
      'TIPI-09',
      'TIPI-10',
    ])
  })

  it('implements canonical TIPI reverse scoring and two-item means', () => {
    const answers = [
      ['TIPI-01', '7'],
      ['TIPI-02', '1'],
      ['TIPI-03', '7'],
      ['TIPI-04', '1'],
      ['TIPI-05', '7'],
      ['TIPI-06', '1'],
      ['TIPI-07', '7'],
      ['TIPI-08', '1'],
      ['TIPI-09', '7'],
      ['TIPI-10', '1'],
    ].map(([itemCode, responseValue]) => ({ itemCode: itemCode!, responseValue: responseValue! }))

    const output = scoreScale(pkg.definition, answers)
    expect(output.quality.status).toBe('interpretable')
    expect(output.scores.map((score) => [score.key, score.value])).toEqual([
      ['extraversion', 7],
      ['agreeableness', 7],
      ['conscientiousness', 7],
      ['emotional_stability', 7],
      ['openness_to_experience', 7],
    ])

    const reverseCodes = pkg.definition.scoring.itemRules
      .filter((rule) => rule.transform.type === 'reverse')
      .map((rule) => rule.itemCode)
    expect(reverseCodes).toEqual(['TIPI-02', 'TIPI-04', 'TIPI-06', 'TIPI-08', 'TIPI-10'])
  })

  it('reports five separate dimensions and never creates a personality total or normative band', () => {
    expect(pkg.definition.scoring.scores).toHaveLength(5)
    expect(pkg.definition.scoring.scores.every((score) => score.type === 'dimension')).toBe(true)
    expect(pkg.definition.report.primaryScoreKeys).toEqual([
      'extraversion',
      'agreeableness',
      'conscientiousness',
      'emotional_stability',
      'openness_to_experience',
    ])
    expect(pkg.definition.report.interpretations).toHaveLength(5)
    expect(pkg.definition.report.interpretations.every((row) => row.source.type === 'score_only')).toBe(true)
    expect(pkg.definition.report.interpretations.every((row) => row.bands.length === 0)).toBe(true)
    expect(pkg.definition.referencePolicy).toEqual({ type: 'none' })
    expect(pkg.definition.report.disclaimer).toContain('不用于心理诊断')
    expect(pkg.definition.report.limitations.join('\n')).toContain('不计算 10 题人格总分')
  })

  it('fails closed when a required TIPI item is missing', () => {
    const answers = pkg.definition.items.slice(0, 9).map((item) => ({
      itemCode: item.itemCode,
      responseValue: '4',
    }))
    const output = scoreScale(pkg.definition, answers)
    expect(output.quality.status).toBe('invalid')
    expect(output.scores.find((score) => score.key === 'openness_to_experience')?.value).toBeNull()
  })
})
