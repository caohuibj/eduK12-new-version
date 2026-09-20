import { describe, expect, it } from 'vitest'
import {
  COGNITIVE_READINESS_PROFILES,
  cognitiveInputNotice,
  resolveCognitiveReadinessProfile,
  usesGlobalKeyboardCapture,
} from '../readiness'

describe('FE-07A Cognitive readiness matrix', () => {
  it('covers every current exact frontend registry identity without version fallback', () => {
    expect(COGNITIVE_READINESS_PROFILES).toHaveLength(25)
    expect(new Set(COGNITIVE_READINESS_PROFILES.map((entry) => `${entry.testType}/${entry.engineVersion}`)).size).toBe(25)
    expect(COGNITIVE_READINESS_PROFILES.every((entry) => entry.engineVersion === '1.0.0')).toBe(true)
    expect(resolveCognitiveReadinessProfile('reaction', '1.0.0')?.category).toBe('timed-response')
    expect(resolveCognitiveReadinessProfile('reaction', '9.9.9')).toBeUndefined()
  })

  it('fails closed on local resume until a task exports explicit durable resume proof', () => {
    for (const entry of COGNITIVE_READINESS_PROFILES) {
      expect(entry.resumeDisposition).toBe('restart-required')
      expect(entry.resumeReason.length).toBeGreaterThan(0)
      expect(entry.frozenMediaSlots).toEqual(['instruction', 'example', 'stimulus'])
    }
  })

  it('keeps global keyboard capture exact and does not infer input from viewport width', () => {
    for (const testType of [
      'reaction',
      'memory',
      'stroop',
      'gonogo',
      'cpt',
      'nback',
      'sst',
      'taskswitch',
      'patterncompare',
      'flanker',
      'cardsort',
      'digitbackward',
      'mentalrotation',
    ]) {
      expect(usesGlobalKeyboardCapture(testType, '1.0.0')).toBe(true)
    }
    expect(usesGlobalKeyboardCapture('corsi', '1.0.0')).toBe(false)
    expect(usesGlobalKeyboardCapture('matrix', '1.0.0')).toBe(false)
    expect(usesGlobalKeyboardCapture('picturesequence', '1.0.0')).toBe(false)
    expect(cognitiveInputNotice('reaction', '1.0.0')).toMatch(/实际输入/)
    expect(cognitiveInputNotice('unknown', '1.0.0')).toBeNull()
  })
})
