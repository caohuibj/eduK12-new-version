export interface User {
  id: string
  username: string
  role: 'STUDENT' | 'TEACHER' | 'ADMIN'
  nickname?: string
  avatarUrl?: string
  phone?: string
  isActive?: boolean
  isFrozen?: boolean
  teacherApproved?: boolean
  expiresAt?: string
  createdAt?: string
  mustChangePassword?: boolean
}

export interface Course {
  id: string
  title: string
  description?: string
  coverUrl?: string
  coverAssetId?: string
  status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED'
  courseCode: string
  creatorId: string
  creator?: User
  isRecruiting: boolean
  isLibrary?: boolean
  studentCount?: number
  students?: CourseStudent[]
  createdAt: string
  updatedAt: string
  endedAt?: string
}

export interface CourseStudent {
  id: string
  courseId: string
  studentId: string
  student: User
  status: 'PENDING' | 'APPROVED' | 'ACTIVE'
  joinedAt: string
}

export interface MediaItem {
  type?: 'library' | 'external' | 'upload'
  id?: string
  assetId?: string
  url: string
  title?: string
  name?: string
  source?: string
}

export interface DocumentItem {
  id: string
  assetId?: string
  url: string
  title: string
  fileName?: string
}

export interface Assignment {
  id: string
  courseId: string
  course?: Course
  title: string
  description?: string
  content?: string
  deadline?: string
  status: 'DRAFT' | 'PUBLISHED'
  questions?: Question[]
  videos?: MediaItem[]
  images?: MediaItem[]
  documents?: DocumentItem[]
  tags?: string[]
  submitted?: boolean
  mySubmission?: Submission
  _count?: { submissions: number }
  createdAt: string
  updatedAt: string
}

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

export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  student?: User
  content?: string
  answers?: Record<string, string>
  comment?: string
  status: 'DRAFT' | 'SUBMITTED' | 'GRADED'
  submittedAt?: string
  reviewedAt?: string
}

export interface Checkin {
  id: string
  courseId: string
  course?: Course
  title: string
  description?: string
  content?: string
  videos?: MediaItem[]
  images?: MediaItem[]
  documents?: DocumentItem[]
  endTime?: string
  allowViewOthers?: boolean
  allowAnonymous?: boolean
  status?: 'DRAFT' | 'PUBLISHED'
  courseName?: string
  submitted?: boolean
  tags?: string[]
  creatorId: string
  creator?: User
  submissions?: CheckinSubmission[]
  submission?: CheckinSubmission
  _count?: { submissions: number }
  createdAt: string
  updatedAt: string
}

export interface CheckinSubmission {
  id: string
  checkinId: string
  studentId: string
  student?: User
  content?: string
  images?: CheckinSubmissionImage[]
  createdAt: string
}

export type CheckinSubmissionImage = string | {
  assetId: string
  url?: string
}

export interface Video {
  id: string
  title: string
  filePath: string
  fileName: string
  fileSize: number
  mimeType: string
  teacherId: string
  teacher?: User
  usageCount: number
  url?: string
  originalAssetId?: string
  processedAssetId?: string
  thumbnailAssetId?: string
  processedUrl?: string
  thumbnailUrl?: string
  createdAt: string
  updatedAt: string
}

export interface Document {
  id: string
  title: string
  filePath: string
  fileName: string
  fileSize: number
  mimeType: string
  teacherId: string
  teacher?: User
  usageCount: number
  url?: string
  assetId?: string
  tags: string[]
  pageCount?: number
  createdAt: string
  updatedAt: string
}

export interface TeacherCode {
  id: string
  code: string
  createdBy: string
  creator?: User
  maxUses: number
  usedCount: number
  expiresAt?: string
  isActive: boolean
  createdAt: string
}

export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

export interface CourseShare {
  id: string
  courseId: string
  sharedBy: string
  sharedTo: string
  createdAt: string
  course?: Course
  sharer?: User
}
