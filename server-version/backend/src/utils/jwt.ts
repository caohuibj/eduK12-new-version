import jwt from 'jsonwebtoken'
import { config } from '../config'
import { JwtPayload } from '../types'

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any
  })
}

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload
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
    { expiresIn: CLASSROOM_RESUME_TOKEN_TTL }
  )
}

export const verifyClassroomResumeToken = (
  token: string,
  classroomId: string
): { sessionId: string } | null => {
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null
    }

    const candidate = payload as Record<string, unknown>
    if (
      candidate.tokenType !== CLASSROOM_RESUME_TOKEN_TYPE ||
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
