import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE } from '../../../modules/scale/instruments/hse_msit_en/1.0.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(SCALE_INSTRUMENT_SOURCE)!

describe('HSE Management Standards Indicator Tool English package', () => {
  it('passes source and package validation with seven official scoring dimensions', () => {
    expect(validateScaleInstrumentSource(SCALE_INSTRUMENT_SOURCE).valid).toBe(true)
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(pkg.definition.scoring.scores.map(row => row.key)).toEqual([
      'demands',
      'control',
      'managerial_support',
      'peer_support',
      'relationships',
      'role',
      'change',
    ])
    expect(pkg.definition.scoring.scores.every(row => row.type === 'dimension')).toBe(true)
    expect(SCALE_INSTRUMENT_SOURCE.executable?.releaseStatus).toBe('DRAFT')
  })

  it('applies the official direction reversal before dimension means', () => {
    const answers = pkg.definition.items.map((row, index) => ({
      itemCode: row.itemCode,
      responseValue: index < 23 ? 'sometimes' : 'neutral',
    }))
    const changed = answers.map(row => row.itemCode === 'HSE-03' ? { ...row, responseValue: 'never' } : row)
    const output = scoreScale(pkg.definition, changed)
    expect(output.itemScores.find(row => row.itemCode === 'HSE-03')?.score).toBe(5)
    expect(output.scores.find(row => row.key === 'demands')?.value).toBe(3.25)
    expect(output.scores.filter(row => row.key !== 'demands').every(row => row.value === 3)).toBe(true)
  })

  it('uses conservative complete-required scoring where public missing-data rules are not established', () => {
    const answers = pkg.definition.items
      .filter(row => row.itemCode !== 'HSE-03')
      .map((row, index) => ({
        itemCode: row.itemCode,
        responseValue: row.sortOrder < 23 ? 'sometimes' : 'neutral',
      }))
    const output = scoreScale(pkg.definition, answers)
    expect(output.quality.status).toBe('invalid')
    expect(output.scores.find(row => row.key === 'demands')?.value).toBeNull()
    expect(output.scores.find(row => row.key === 'control')?.value).toBe(3)
    expect(() => scoreScale(pkg.definition, [{ itemCode: 'HSE-01', responseValue: '6' }])).toThrow()
  })
})
