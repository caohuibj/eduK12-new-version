import { describe, expect, it } from 'vitest'
import { respondentCompletionFeedback } from '../../modules/assessment-policy/feedback'

describe('respondent immediate feedback', () => {
  it.each(['SELF_REPORT', 'OBSERVER_REPORT', 'RELATIONAL_EXPERIENCE', null])('acknowledges completion without result fields for %s', perspective => {
    const value = respondentCompletionFeedback({ state: 'COMPLETED', perspective })
    expect(value?.message).toBeTruthy()
    expect(Object.keys(value!)).toEqual(['schemaVersion', 'kind', 'title', 'message'])
    expect(respondentCompletionFeedback({ state: 'STARTED', perspective })).toBeNull()
  })
})
