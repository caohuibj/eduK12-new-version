import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE } from '../../../modules/scale/instruments/cbi_en/1.0.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(SCALE_INSTRUMENT_SOURCE)!

describe('CBI English instrument package', () => {
  it('passes source and package validation without inventing an overall total', () => {
    expect(validateScaleInstrumentSource(SCALE_INSTRUMENT_SOURCE).valid).toBe(true)
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(pkg.definition.scoring.scores.map(row => row.key)).toEqual([
      'personal_burnout',
      'work_related_burnout',
      'client_related_burnout',
    ])
    expect(pkg.definition.scoring.scores.every(row => row.type === 'dimension')).toBe(true)
    expect(SCALE_INSTRUMENT_SOURCE.executable?.releaseStatus).toBe('PUBLISHED')
  })

  it('reverses the work-energy item exactly and preserves the source mean rule', () => {
    const answers = [
      ...['CBI-P1','CBI-P2','CBI-P3','CBI-P4','CBI-P5','CBI-P6'].map(itemCode => ({ itemCode, responseValue: 'sometimes' })),
      ...['CBI-W1','CBI-W2','CBI-W3'].map(itemCode => ({ itemCode, responseValue: 'somewhat' })),
      ...['CBI-W4','CBI-W5','CBI-W6'].map(itemCode => ({ itemCode, responseValue: 'sometimes' })),
      { itemCode: 'CBI-W7', responseValue: 'never_almost_never' },
      ...['CBI-C1','CBI-C2','CBI-C3','CBI-C4'].map(itemCode => ({ itemCode, responseValue: 'somewhat' })),
      ...['CBI-C5','CBI-C6'].map(itemCode => ({ itemCode, responseValue: 'sometimes' })),
    ]
    const output = scoreScale(pkg.definition, answers)
    expect(output.itemScores.find(row => row.itemCode === 'CBI-W7')?.score).toBe(100)
    expect(output.scores.find(row => row.key === 'work_related_burnout')?.value).toBeCloseTo(400 / 7, 12)
  })

  it('implements the source minimum-answered rules without guessing missing values', () => {
    const maxCase = SCALE_INSTRUMENT_SOURCE.executable!.goldenCases.find(row => row.name === 'all-maximum-burnout')!
    const oneMissing = scoreScale(pkg.definition, maxCase.answers.filter(row => row.itemCode !== 'CBI-P6'))
    expect(oneMissing.quality.status).toBe('limited')
    expect(oneMissing.scores.find(row => row.key === 'personal_burnout')?.value).toBe(100)

    const belowMinimum = scoreScale(pkg.definition, maxCase.answers.filter(row => !row.itemCode.startsWith('CBI-P') || ['CBI-P1','CBI-P2'].includes(row.itemCode)))
    expect(belowMinimum.quality.status).toBe('invalid')
    expect(belowMinimum.scores.find(row => row.key === 'personal_burnout')?.value).toBeNull()
    expect(() => scoreScale(pkg.definition, [{ itemCode: 'CBI-P1', responseValue: 'invalid' }])).toThrow()
  })
})
