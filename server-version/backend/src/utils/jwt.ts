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
