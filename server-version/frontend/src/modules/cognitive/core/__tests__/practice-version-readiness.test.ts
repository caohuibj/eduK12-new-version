import { describe, expect, it } from 'vitest'
import { resolveCognitiveReadinessProfile } from '../readiness'
import { resolveRunner } from '../../registry'

describe('new independent-practice identities use existing readiness contracts', () => {
  it.each([
    { task: 'matrix', category: 'fixed-trial', keyboard: false, scoring: '1.0.0' },
    { task: 'reversallearning', category: 'learning', keyboard: false, scoring: '1.0.0' },
    { task: 'numberline', category: 'visuospatial', keyboard: false, scoring: '1.1.0' },
    { task: 'maze', category: 'visuospatial', keyboard: true, scoring: '1.0.1' },
  ])('$task C1.1 resolves exactly, retaining conservative resume and actual input handling', ({task, category, keyboard, scoring}) => {
    expect(resolveRunner(task,'1.1.0')?.scoringVersion).toBe(scoring)
    expect(resolveCognitiveReadinessProfile(task,'1.1.0')).toMatchObject({ testType: task, engineVersion: '1.1.0', category, globalKeyboardCapture: keyboard, inputs: ['keyboard','pointer','touch'], orientation: 'any', resumeDisposition: 'restart-required', frozenMediaSlots: ['instruction','example','stimulus'] })
    expect(resolveCognitiveReadinessProfile(task,'1.1.1')).toBeUndefined()
  })
})
