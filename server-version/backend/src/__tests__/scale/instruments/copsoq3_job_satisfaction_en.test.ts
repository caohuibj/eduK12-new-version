import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE } from '../../../modules/scale/instruments/copsoq3_job_satisfaction_en/1.0.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(SCALE_INSTRUMENT_SOURCE)!

describe('COPSOQ III International Middle Job Satisfaction package', () => {
  it('passes deterministic source/package validation as PILOT content', () => {
    expect(validateScaleInstrumentSource(SCALE_INSTRUMENT_SOURCE).valid).toBe(true)
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(SCALE_INSTRUMENT_SOURCE.catalog.scientificMaturity).toBe('PILOT')
    expect(SCALE_INSTRUMENT_SOURCE.scientificReview).toBeUndefined()
    expect(SCALE_INSTRUMENT_SOURCE.executable?.releaseStatus).toBe('PUBLISHED')
    expect(pkg.definition.items).toHaveLength(3)
  })

  it('uses the COPSOQ 0-100 response mapping and arithmetic mean', () => {
    const mixed = scoreScale(pkg.definition, [
      { itemCode: 'COPSOQ-JS1', responseValue: 'very_satisfied' },
      { itemCode: 'COPSOQ-JS4', responseValue: 'neither_nor' },
      { itemCode: 'COPSOQ-JS5', responseValue: 'very_unsatisfied' },
    ])
    expect(mixed.quality.status).toBe('interpretable')
    expect(mixed.scores.find(row => row.key === 'job_satisfaction')?.value).toBe(50)
    expect(mixed.itemScores.map(row => row.score)).toEqual([100, 50, 0])
  })

  it('fails closed rather than inventing a partial-score rule', () => {
    const output = scoreScale(pkg.definition, [
      { itemCode: 'COPSOQ-JS1', responseValue: 'satisfied' },
      { itemCode: 'COPSOQ-JS4', responseValue: 'satisfied' },
    ])
    expect(output.quality.status).toBe('invalid')
    expect(output.scores.find(row => row.key === 'job_satisfaction')?.value).toBeNull()
    expect(pkg.definition.scoring.defaultMissingPolicy.type).toBe('complete_required')
  })
})
