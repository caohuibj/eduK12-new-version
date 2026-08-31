import { describe, expect, it } from 'vitest'
import { mergeScaleAnswersWithRevision } from '../../modules/scale/scale-answer-concurrency'

describe('scale answer optimistic concurrency', () => {
  it('increments only the changed item revision', () => {
    const result = mergeScaleAnswersWithRevision(
      [{ itemCode: 'q1', responseValue: 1, changeCount: 0, revision: 3 }],
      [{ itemCode: 'q2', responseValue: 2, expectedRevision: 0 }],
    )

    expect(result).toEqual({
      kind: 'saved',
      changedCount: 1,
      answers: [
        { itemCode: 'q1', responseValue: 1, changeCount: 0, revision: 3 },
        expect.objectContaining({ itemCode: 'q2', responseValue: 2, revision: 1, changeCount: 0 }),
      ],
    })
  })

  it('rejects a stale write for the same item', () => {
    const result = mergeScaleAnswersWithRevision(
      [{ itemCode: 'q1', responseValue: 1, changeCount: 0, revision: 2 }],
      [{ itemCode: 'q1', responseValue: 2, expectedRevision: 1 }],
    )

    expect(result).toEqual({ kind: 'stale', itemCode: 'q1' })
  })

  it('keeps an identical replay idempotent even after a newer acknowledgement', () => {
    const result = mergeScaleAnswersWithRevision(
      [{ itemCode: 'q1', responseValue: 1, responseTimeMs: 250, changeCount: 4, revision: 2 }],
      [{ itemCode: 'q1', responseValue: 1, responseTimeMs: 250, expectedRevision: 1 }],
    )

    expect(result).toEqual({
      kind: 'saved',
      changedCount: 0,
      answers: [{ itemCode: 'q1', responseValue: 1, responseTimeMs: 250, changeCount: 4, revision: 2 }],
    })
  })
})
