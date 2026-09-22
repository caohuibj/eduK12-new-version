import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE } from '../../../modules/scale/instruments/tswq_en/1.0.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(SCALE_INSTRUMENT_SOURCE)!

describe('TSWQ English instrument package', () => {
  it('passes source and package validation with deterministic golden cases', () => {
    expect(validateScaleInstrumentSource(SCALE_INSTRUMENT_SOURCE).valid).toBe(true)
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(SCALE_INSTRUMENT_SOURCE.catalog.scientificMaturity).toBe('PILOT')
    expect(SCALE_INSTRUMENT_SOURCE.executable?.releaseStatus).toBe('PUBLISHED')
    expect(SCALE_INSTRUMENT_SOURCE.scientificReview).toBeUndefined()
  })

  it('keeps the published two-subscale allocation and composite deterministic', () => {
    const output = scoreScale(pkg.definition, pkg.definition.items.map((row, index) => ({
      itemCode: row.itemCode,
      responseValue: index % 2 === 0 ? '4' : '1',
    })))
    expect(output.quality.status).toBe('interpretable')
    expect(output.scores.find(row => row.key === 'school_connectedness')?.value).toBe(16)
    expect(output.scores.find(row => row.key === 'teaching_efficacy')?.value).toBe(4)
    expect(output.scores.find(row => row.key === 'teacher_subjective_wellbeing')?.value).toBe(20)
    expect(pkg.definition.scoring.itemRules.every(row => row.transform.type === 'identity')).toBe(true)
  })

  it('fails closed on missing or invalid responses', () => {
    const missing = scoreScale(pkg.definition, pkg.definition.items.slice(0, 7).map(row => ({
      itemCode: row.itemCode,
      responseValue: '3',
    })))
    expect(missing.quality.status).toBe('invalid')
    expect(missing.scores.find(row => row.key === 'teaching_efficacy')?.value).toBeNull()
    expect(missing.scores.find(row => row.key === 'teacher_subjective_wellbeing')?.value).toBeNull()
    expect(() => scoreScale(pkg.definition, [{ itemCode: 'TSWQ-01', responseValue: '5' }])).toThrow()
  })
})
