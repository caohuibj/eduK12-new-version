import { describe, expect, it } from 'vitest'
import { shouldUseWholeRunner } from '../whole-runner-entry'

const base = {
  trainingFlow: undefined,
  productKind: 'QUESTIONNAIRE',
  currentItem: { type: 'SCALE' } as unknown as import('../types').CompositeAttemptState['currentItem'],
}

describe('whole runner entry decision (X-05A review)', () => {
  it('mounts for WHOLE_LOCAL attempts regardless of the first unit type', () => {
    // Form-first: the first currentItem is a Form section, yet the attempt is
    // server-declared WHOLE_LOCAL — the runner must mount.
    expect(shouldUseWholeRunner({
      ...base, executionMode: 'WHOLE_LOCAL',
      currentItem: { type: 'FORM_SECTION' } as unknown as typeof base.currentItem,
    }, false)).toBe(true)
    expect(shouldUseWholeRunner({ ...base, executionMode: 'WHOLE_LOCAL' }, false)).toBe(true)
  })

  it('keeps the legacy discovery path when the server does not send executionMode', () => {
    expect(shouldUseWholeRunner({ ...base, executionMode: undefined }, false)).toBe(true)
    // STEPPED with a Scale first unit still tries the runner, which falls back
    // on a refused delivery (existing behavior).
    expect(shouldUseWholeRunner({ ...base, executionMode: 'STEPPED' }, false)).toBe(true)
  })

  it('rejects training flows, non-questionnaires, relational mode and Form-first STEPPED attempts', () => {
    expect(shouldUseWholeRunner({ ...base, trainingFlow: {} as never }, false)).toBe(false)
    expect(shouldUseWholeRunner({ ...base, productKind: 'ASSESSMENT_BUNDLE' }, false)).toBe(false)
    expect(shouldUseWholeRunner(base, true)).toBe(false)
    expect(shouldUseWholeRunner({
      ...base, executionMode: 'STEPPED',
      currentItem: { type: 'FORM_SECTION' } as unknown as typeof base.currentItem,
    }, false)).toBe(false)
    expect(shouldUseWholeRunner(null, false)).toBe(false)
  })
})
