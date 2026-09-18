import { UserRole, CourseStatus, CourseStudentStatus, AssignmentStatus, SubmissionStatus } from '@prisma/client'

export { UserRole, CourseStatus, CourseStudentStatus, AssignmentStatus, SubmissionStatus }

export type PlatformRole = 'SYSTEM_ADMIN' | 'STANDARD'

// JWT is a credential, not an authority snapshot. Legacy role remains in the
// token for compatibility, but protected authorization must use the current
// database principal hydrated by auth middleware.
export interface JwtPayload {
  userId: string
  username: string
  role: UserRole
  tokenVersion: number
  mustChangePassword?: boolean
}

export interface AuthenticatedPrincipal {
  userId: string
  username: string
  role: UserRole
  platformRole: PlatformRole
  tokenVersion: number
  mustChangePassword: boolean
}

// Request with current database principal
export interface AuthenticatedRequest extends Express.Request {
  user?: AuthenticatedPrincipal
}

// API Response
export interface ApiResponse<T = any> {
  code: number | string
  message: string
  data?: T
}

// Question type for assignment
export interface Question {
  id: string
  type: 'single_choice' | 'multiple_choice' | 'text'
  question: string
  options?: {
    key: string
    text: string
    points: number
  }[]
}

// File upload info
export interface UploadedFile {
  fieldname: string
  originalname: string
  encoding: string
  mimetype: string
  destination: string
  filename: string
  path: string
  size: number
}
