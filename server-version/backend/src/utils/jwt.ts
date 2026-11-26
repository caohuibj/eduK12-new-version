import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { config } from '../config'
import { JwtPayload } from '../types'

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as any,
    // Distinct signed sessions, even from two logins during one second.
    jwtid: randomUUID(),
  })
}

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    if (typeof claims !== 'object' || claims.tokenType !== undefined ||
      typeof claims.userId !== 'string' || !claims.userId.trim() ||
      !Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0 ||
      !Number.isSafeInteger(claims.exp)) return null
    return claims as JwtPayload
  } catch (error) {
    return null
  }
}

const CLASSROOM_RESUME_TOKEN_TYPE = 'classroom-student-resume'
const CLASSROOM_RESUME_TOKEN_TTL = '30d'

/**
 * Issue a server-controlled resume token for an anonymous classroom session.
 * The token is intentionally separate from user authentication tokens and
 * can only be used with the classroom/session binding encoded in it.
 */
export const generateClassroomResumeToken = (
  classroomId: string,
  sessionId: string
): string => {
  return jwt.sign(
    {
      tokenType: CLASSROOM_RESUME_TOKEN_TYPE,
      classroomId,
      sessionId,
    },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: CLASSROOM_RESUME_TOKEN_TTL }
  )
}

export const verifyClassroomResumeToken = (
  token: string,
  classroomId: string
): { sessionId: string } | null => {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null
    }

    const candidate = payload as Record<string, unknown>
    if (
      candidate.tokenType !== CLASSROOM_RESUME_TOKEN_TYPE ||
      !Number.isSafeInteger(candidate.exp) ||
      candidate.classroomId !== classroomId ||
      typeof candidate.sessionId !== 'string' ||
      !candidate.sessionId
    ) {
      return null
    }

    return { sessionId: candidate.sessionId }
  } catch {
    return null
  }
}
