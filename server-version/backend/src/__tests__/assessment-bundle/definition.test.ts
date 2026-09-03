import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  assessmentBundleResourceId,
  hashAssessmentBundleDefinition,
  validateAssessmentBundleCatalog,
  validateAssessmentBundleDefinition,
} from '../../modules/assessment-bundle/definition'
import { cognitiveSelfBundle, formSlotBundle, observerBundle } from './fixtures'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected BundleContractError')
  } catch (error) {
    if (error instanceof BundleContractError) return error.code
    throw error
  }
}

describe('AssessmentBundleDefinitionV1', () => {
  it('accepts a cognitive SELF bundle and a FORM slot contract', () => {
    expect(validateAssessmentBundleDefinition(cognitiveSelfBundle()).slots).toHaveLength(2)
    expect(validateAssessmentBundleDefinition(formSlotBundle()).slots[0]).toMatchObject({
      slotKey: 'background',
      unitType: 'FORM',
    })
    expect(validateAssessmentBundleDefinition(observerBundle()).engine.key).toBe('scale-evidence-v1')
  })

  it('rejects duplicate bundleKey@version', () => {
    expect(failCode(() => validateAssessmentBundleCatalog([
      cognitiveSelfBundle(),
      cognitiveSelfBundle({ name: 'copy' }),
    ]))).toBe('DUPLICATE_BUNDLE')
    expect(assessmentBundleResourceId('cognitive_response_inhibition_v1', '1.0.0'))
      .toBe('cognitive_response_inhibition_v1@1.0.0')
  })

  it('rejects unknown slot types and duplicate slotKey', () => {
    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      slots: [{
        ...cognitiveSelfBundle().slots[0],
        unitType: 'QUESTIONNAIRE' as 'FORM',
      }],
    })))).toBe('INVALID_DEFINITION')
    expect(failCode(() => validateAssessmentBundleDefinition({
      ...cognitiveSelfBundle(),
      slots: [{
        ...cognitiveSelfBundle().slots[0],
        valueSelectors: 'total' as unknown as string[],
      }],
    }))).toBe('INVALID_DEFINITION')

    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      slots: [
        cognitiveSelfBundle().slots[0],
        { ...cognitiveSelfBundle().slots[1], slotKey: 'gonogo', position: 1 },
      ],
    })))).toBe('DUPLICATE_SLOT_KEY')
  })

  it('requires exact engine key/version', () => {
    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      engine: { key: 'mystery-engine-v1' as 'cognitive-domain-v1', version: '1.0.0' },
    })))).toBe('INVALID_DEFINITION')
    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      engine: { key: 'cognitive-domain-v1', version: '' },
    })))).toBe('INVALID_DEFINITION')
    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      engine: { key: 'cognitive-domain-v1', version: '^1.0.0' },
    })))).toBe('INVALID_DEFINITION')
  })

  it('rejects invalid respondent/population combinations', () => {
    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      respondentTypes: ['PARENT'],
    })))).toBe('INVALID_RESPONDENT_POPULATION')
    expect(failCode(() => validateAssessmentBundleDefinition({
      ...observerBundle(),
      respondentTypes: ['SELF'],
    }))).toBe('INVALID_RESPONDENT_POPULATION')
    // Generic contract: integrated does not force adult / minAge>=18.
    expect(validateAssessmentBundleDefinition(cognitiveSelfBundle({
      category: 'integrated',
      population: { subjectPopulation: 'youth' },
    })).population.subjectPopulation).toBe('youth')
    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      population: { subjectPopulation: 'youth', subjectMinAgeYears: 18, subjectMaxAgeYears: 10 },
    })))).toBe('INVALID_RESPONDENT_POPULATION')
    expect(failCode(() => validateAssessmentBundleDefinition(cognitiveSelfBundle({
      initiationModes: ['PARENT_SELF_SERVE'],
    })))).toBe('INVALID_RESPONDENT_POPULATION')
  })

  it('hashes definitions stably', () => {
    expect(hashAssessmentBundleDefinition(cognitiveSelfBundle()))
      .toBe(hashAssessmentBundleDefinition(cognitiveSelfBundle()))
    expect(hashAssessmentBundleDefinition(cognitiveSelfBundle()))
      .not.toBe(hashAssessmentBundleDefinition(cognitiveSelfBundle({ name: 'other' })))
  })
})
