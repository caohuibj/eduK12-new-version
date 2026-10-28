import { describe, expect, it } from 'vitest'
import { validateTaskDefinition } from '../../modules/cognitive/v2/publication-gate'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { enumerationDefinition } from '../../modules/cognitive/content-candidates/enumeration/package'
import { recognitionDefinition } from '../../modules/cognitive/content-candidates/continuous-recognition/package'
import { antDefinition } from '../../modules/cognitive/content-candidates/ant/package'

// This audit records existing platform blockers. It is never publication eligibility.
const candidates = [
  { definition: enumerationDefinition, issues: () => validateTaskDefinition(enumerationDefinition) },
  { definition: recognitionDefinition, issues: () => validateTaskDefinition(recognitionDefinition) },
  { definition: antDefinition, issues: () => validateTaskDefinition(antDefinition) },
]
describe('unregistered candidate admission audit at the current platform baseline', () => {
  for (const { definition, issues } of candidates) {
    it(`${definition.testType}: real definition validator exposes the required standard-profile blocker only`, () => {
      expect(issues()).toEqual([{ path: 'profiles', message: 'standard profile is required', severity: 'error' }])
    })
    it(`${definition.testType}: production resolver does not admit the isolated native definition`, () => {
      expect(getCognitiveV2TaskDefinition(definition.testType, definition.engineVersion, definition.scoringVersion)).toBeUndefined()
    })
  }
})
