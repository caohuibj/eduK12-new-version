import { beforeEach, describe, expect, it } from 'vitest'
import {
  questionnaireResumeHeaders,
  readQuestionnaireResumeToken,
  saveQuestionnaireResumeToken,
} from '../questionnaireResume'

describe('questionnaire resume capability storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('stores the capability in sessionStorage and binds it to the session id', () => {
    saveQuestionnaireResumeToken('public-token', 'session-1', 'resume-secret')

    expect(readQuestionnaireResumeToken('public-token', 'session-1')).toBe('resume-secret')
    expect(readQuestionnaireResumeToken('public-token', 'session-2')).toBe('')
    expect(questionnaireResumeHeaders('public-token', 'session-1')).toEqual({
      Authorization: 'Bearer resume-secret',
    })
  })

  it('does not return a capability for a missing or mismatched locator', () => {
    saveQuestionnaireResumeToken('public-token', 'session-1', 'resume-secret')

    expect(readQuestionnaireResumeToken(undefined, 'session-1')).toBe('')
    expect(readQuestionnaireResumeToken('public-token', null)).toBe('')
    expect(questionnaireResumeHeaders('public-token', 'session-2')).toEqual({})
  })
})
