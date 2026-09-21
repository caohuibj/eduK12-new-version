import { describe, expect, it } from 'vitest'
import { resolveRunner } from '../registry'

const EXPECTED_FRONTEND_RUNNERS = [
  'bart',
  'cardsort',
  'corsi',
  'cpt',
  'digitbackward',
  'emotionrecognition',
  'fake',
  'flanker',
  'gonogo',
  'lexicaldecision',
  'matrix',
  'memory',
  'mentalrotation',
  'nback',
  'pairedassociate',
  'patterncompare',
  'picturesequence',
  'reaction',
  'reversallearning',
  'sst',
  'stroop',
  'taskswitch',
  'tower',
  'trailmaking',
  'wordlist',
] as const

describe('Cognitive frontend onboarding compatibility baseline', () => {
  it('freezes the current exact frontend runner inventory at engine 1.0.0', () => {
    for (const testType of EXPECTED_FRONTEND_RUNNERS) {
      const runner = resolveRunner(testType, '1.0.0')
      expect(runner, testType).toBeDefined()
      expect(runner?.testType).toBe(testType)
      expect(runner?.engineVersion).toBe('1.0.0')
    }
  })

  it('does not introduce a frontend latest-version fallback', () => {
    for (const testType of EXPECTED_FRONTEND_RUNNERS) {
      expect(resolveRunner(testType, '9.9.9'), testType).toBeUndefined()
    }
  })
})
