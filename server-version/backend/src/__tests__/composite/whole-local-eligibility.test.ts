import { describe, it, expect } from 'vitest'
import { isWholeLocalEligible } from '../../modules/composite/whole-local-eligibility'

describe('isWholeLocalEligible', () => {
  it('returns true for pure linear Scale questionnaires', () => {
    expect(isWholeLocalEligible({
      items: [
        { type: 'SCALE', position: 1 },
        { type: 'SCALE', position: 2 },
      ],
    })).toBe(true)
  })

  it('returns true for Form + Scale combination', () => {
    expect(isWholeLocalEligible({
      items: [
        { type: 'FORM', position: 1 },
        { type: 'SCALE', position: 2 },
        { type: 'SCALE', position: 3 },
      ],
      formSections: [{ id: 'sec-1' }],
    })).toBe(true)
  })

  it('returns false when candidate has Cognitive items', () => {
    expect(isWholeLocalEligible({
      items: [
        { type: 'SCALE', position: 1 },
        { type: 'COGNITIVE', position: 2 },
      ],
    })).toBe(false)
  })

  it('returns false when candidate has Situational items', () => {
    expect(isWholeLocalEligible({
      items: [
        { type: 'SCALE', position: 1 },
        { type: 'SITUATIONAL', position: 2 },
      ],
    })).toBe(false)
  })

  it('returns false when candidate has training flow branching or conditions', () => {
    expect(isWholeLocalEligible({
      items: [{ type: 'SCALE', position: 1 }],
      trainingFlowDraft: { rules: [] },
    })).toBe(false)

    expect(isWholeLocalEligible({
      items: [{ type: 'SCALE', position: 1 }],
      trainingFlowFrozen: { rules: [] },
    })).toBe(false)

    expect(isWholeLocalEligible({
      items: [{ type: 'SCALE', position: 1 }],
      trainingFlowDigest: 'sha256-hash',
    })).toBe(false)

    expect(isWholeLocalEligible({
      items: [{ type: 'SCALE', position: 1 }],
      trainingFlowSnapshotHash: 'sha256-hash',
    })).toBe(false)
  })

  it('returns false for null, undefined, or empty items', () => {
    expect(isWholeLocalEligible(null)).toBe(false)
    expect(isWholeLocalEligible(undefined)).toBe(false)
    expect(isWholeLocalEligible({ items: [] })).toBe(false)
  })
})
