import { describe, expect, it } from 'vitest'
import { prepareFormAnswerChanges } from '../../services/questionnaire-form-answer-concurrency'

describe('questionnaire form answer optimistic concurrency', () => {
  it('allows different form items to merge independently', () => {
    const result = prepareFormAnswerChanges(
      [{ formItemId: 'name', value: 'Alice', status: 'ANSWERED', revision: 3 }],
      [{ formItemId: 'grade', value: '5', status: 'ANSWERED', expectedRevision: 0 }],
    )

    expect(result).toEqual({
      kind: 'saved',
      changes: [{
        input: { formItemId: 'grade', value: '5', status: 'ANSWERED', expectedRevision: 0 },
        previous: undefined,
        next: { formItemId: 'grade', value: '5', status: 'ANSWERED', revision: 1 },
        replay: false,
      }],
    })
  })

  it('rejects a stale write for the same form item', () => {
    const result = prepareFormAnswerChanges(
      [{ formItemId: 'name', value: 'Alice', status: 'ANSWERED', revision: 2 }],
      [{ formItemId: 'name', value: 'Bob', status: 'ANSWERED', expectedRevision: 1 }],
    )

    expect(result).toEqual({ kind: 'stale', formItemId: 'name' })
  })

  it('does not advance the revision for an identical replay', () => {
    const result = prepareFormAnswerChanges(
      [{ formItemId: 'name', value: 'Alice', status: 'ANSWERED', revision: 2 }],
      [{ formItemId: 'name', value: 'Alice', status: 'ANSWERED', expectedRevision: 1 }],
    )

    expect(result).toEqual({
      kind: 'saved',
      changes: [{
        input: { formItemId: 'name', value: 'Alice', status: 'ANSWERED', expectedRevision: 1 },
        previous: { formItemId: 'name', value: 'Alice', status: 'ANSWERED', revision: 2 },
        next: { formItemId: 'name', value: 'Alice', status: 'ANSWERED', revision: 2 },
        replay: true,
      }],
    })
  })
})
