import { UserRole, CourseStatus, CourseStudentStatus, AssignmentStatus, SubmissionStatus } from '@prisma/client'

export { UserRole, CourseStatus, CourseStudentStatus, AssignmentStatus, SubmissionStatus }

// JWT Payload
export interface JwtPayload {
  userId: string
  username: string
  role: UserRole
}

// Request with user
export interface AuthenticatedRequest extends Express.Request {
  user?: JwtPayload
}

// API Response
export interface ApiResponse<T = any> {
  code: number
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
