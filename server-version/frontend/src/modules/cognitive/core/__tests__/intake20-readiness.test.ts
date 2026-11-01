import { describe, expect, it } from 'vitest'
import { resolveRunner } from '../../registry'
import { resolveCognitiveReadinessProfile, usesGlobalKeyboardCapture } from '../readiness'

// Audited formal response paths, not a qualification or installation allowlist.
// Keyboard includes local handlers and stable native button activation.
const contracts = [
  ['numberline', 'fixed-trial', false, ['keyboard', 'pointer', 'touch']],
  ['arithverify', 'timed-response', true, ['keyboard', 'pointer', 'touch']],
  ['sizecongruity', 'timed-response', true, ['keyboard', 'pointer', 'touch']],
  ['delaydiscount', 'adaptive', true, ['keyboard', 'pointer', 'touch']],
  ['gamblingdeck', 'decision', false, ['keyboard', 'pointer', 'touch']],
  ['symbolmatch', 'timed-response', true, ['keyboard', 'pointer', 'touch']],
  ['runningspan', 'staged', false, ['keyboard', 'pointer', 'touch']],
  ['sentencecheck', 'timed-response', true, ['keyboard', 'pointer', 'touch']],
  ['seqlearn', 'learning', true, ['keyboard', 'pointer', 'touch']],
  ['timecopy', 'timed-response', false, ['keyboard', 'pointer', 'touch']],
  ['letternumseries', 'staged', false, ['keyboard', 'pointer', 'touch']],
  ['semanticfluency', 'timed-response', false, ['keyboard']],
  ['cancellation', 'timed-response', false, ['pointer', 'touch']],
  ['trustgame', 'decision', true, ['keyboard', 'pointer', 'touch']],
  ['ufov', 'visuospatial', true, ['keyboard', 'pointer', 'touch']],
  ['pursuitrotor', 'visuospatial', false, ['pointer']],
  ['visualwm', 'staged', true, ['keyboard', 'pointer', 'touch']],
  ['maze', 'planning', true, ['keyboard', 'pointer', 'touch']],
  ['auditoryrt', 'timed-response', true, ['keyboard', 'pointer', 'touch']],
  ['auditorynback', 'timed-response', true, ['keyboard', 'pointer', 'touch']],
] as const

describe('intake20 frontend readiness contracts', () => {
  it.each(contracts)('%s resolves its audited exact identity and preserves completion semantics', (testType, category, globalKeyboardCapture, inputs) => {
    const entry = resolveRunner(testType, '1.0.1')
    expect(entry?.completionMode).toBe('task')
    expect(entry?.prepareRunner).toBeTypeOf('function')
    const readiness = resolveCognitiveReadinessProfile(testType, '1.0.1')
    expect(readiness).toMatchObject({ testType, engineVersion: '1.0.1', category, inputs,
      globalKeyboardCapture, resumeDisposition: 'restart-required', orientation: 'any',
      frozenMediaSlots: ['instruction', 'example', 'stimulus'],
    })
    expect(readiness?.resumeReason.length).toBeGreaterThan(0)
    expect(usesGlobalKeyboardCapture(testType, '1.0.1')).toBe(globalKeyboardCapture)
    // No old, nearby or latest version fallback.
    expect(resolveCognitiveReadinessProfile(testType, '1.0.0')).toBeUndefined()
    expect(resolveCognitiveReadinessProfile(testType, '1.0.2')).toBeUndefined()
  })
})
