import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { config } from '../../config'
import { UserRole } from '../../types'
import {
  generateClassroomResumeToken,
  generateToken,
  verifyToken,
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

  it('keeps classroom and browser credentials distinct', () => {
    const session = generateToken({ userId: 'user-1', tokenVersion: 0, role: UserRole.STUDENT, username: 'student' })
    expect(verifyClassroomResumeToken(session, 'classroom-1')).toBeNull()
    expect(verifyToken(generateClassroomResumeToken('classroom-1', 'session-1'))).toBeNull()
    expect(verifyToken(session)?.userId).toBe('user-1')
  })

  it('requires an expiring session with a valid identity, version and signing algorithm', () => {
    const claims = { userId: 'user-1', tokenVersion: 0 }
    for (const payload of [{ ...claims, userId: '' }, { ...claims, tokenVersion: -1 }]) {
      expect(verifyToken(jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' }))).toBeNull()
    }
    expect(verifyToken(jwt.sign(claims, config.jwtSecret))).toBeNull()
    expect(verifyToken(jwt.sign(claims, config.jwtSecret, { expiresIn: '1h', algorithm: 'HS384' }))).toBeNull()
    expect(verifyToken(jwt.sign(claims, config.jwtSecret, { expiresIn: '1h' }))).toMatchObject(claims)
  })

  it('rejects forged tokens', () => {
    expect(
      verifyClassroomResumeToken('not-a-valid-token', 'classroom-1')
    ).toBeNull()
  })
})
