import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE } from '../../../modules/scale/instruments/jcq_en/1.0.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const pkg = projectScalePackage(SCALE_INSTRUMENT_SOURCE)!

describe('JCQ English instrument package', () => {
  it('passes deterministic source/package validation as a PILOT research-use package', () => {
    expect(validateScaleInstrumentSource(SCALE_INSTRUMENT_SOURCE).valid).toBe(true)
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(SCALE_INSTRUMENT_SOURCE.catalog.scientificMaturity).toBe('PILOT')
    expect(SCALE_INSTRUMENT_SOURCE.scientificReview).toBeUndefined()
    expect(SCALE_INSTRUMENT_SOURCE.executable?.releaseStatus).toBe('PUBLISHED')
    expect(SCALE_INSTRUMENT_SOURCE.executable?.definition.license.redistribution).toBe('restricted')
    expect(SCALE_INSTRUMENT_SOURCE.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL'])
  })

  it('scores task, cognitive, relational and total job crafting as 1-6 means', () => {
    const high = scoreScale(pkg.definition, pkg.definition.items.map(row => ({
      itemCode: row.itemCode,
      responseValue: '6',
    })))
    expect(high.quality.status).toBe('interpretable')
    expect(Object.fromEntries(high.scores.map(row => [row.key, row.value]))).toEqual({
      task_crafting: 6,
      cognitive_crafting: 6,
      relational_crafting: 6,
      total_job_crafting: 6,
    })
    expect(pkg.definition.scoring.scores.every(row => row.direction === 'higher_is_more')).toBe(true)
    expect(pkg.definition.scoring.itemRules.every(row => row.transform.type === 'identity')).toBe(true)
  })

  it('preserves facet separation and fails closed on missing items', () => {
    const separated = SCALE_INSTRUMENT_SOURCE.executable!.goldenCases.find(row => row.name === 'facet-separation')!
    const scored = scoreScale(pkg.definition, separated.answers)
    expect(scored.scores.find(row => row.key === 'task_crafting')?.value).toBe(6)
    expect(scored.scores.find(row => row.key === 'cognitive_crafting')?.value).toBe(3)
    expect(scored.scores.find(row => row.key === 'relational_crafting')?.value).toBe(1)
    expect(scored.scores.find(row => row.key === 'total_job_crafting')?.value).toBeCloseTo(10 / 3, 12)

    const missing = SCALE_INSTRUMENT_SOURCE.executable!.goldenCases.find(row => row.name === 'missing-one-task')!
    const missingOutput = scoreScale(pkg.definition, missing.answers)
    expect(missingOutput.quality.status).toBe('invalid')
    expect(missingOutput.scores.find(row => row.key === 'task_crafting')?.value).toBeNull()
    expect(missingOutput.scores.find(row => row.key === 'total_job_crafting')?.value).toBeNull()
  })
})
