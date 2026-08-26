import { describe, expect, it } from 'vitest'
import {
  generateClassroomResumeToken,
  verifyClassroomResumeToken,
} from '../../utils/jwt'

describe('classroom anonymous resume tokens', () => {
  it('binds a token to one classroom and session', () => {
    const token = generateClassroomResumeToken('classroom-1', 'session-1')

    expect(verifyClassroomResumeToken(token, 'classroom-1')).toEqual({
      sessionId: 'session-1',
    })
    expect(verifyClassroomResumeToken(token, 'classroom-2')).toBeNull()
  })

  it('rejects forged tokens', () => {
    expect(
      verifyClassroomResumeToken('not-a-valid-token', 'classroom-1')
    ).toBeNull()
  })
})
