/**
 * 共享类型定义
 * 用于减少重复代码，统一类型规范
 */

// 媒体相关类型
export interface VideoItem {
  type: 'library' | 'external' | 'upload'
  id?: string
  url: string
  title: string
  thumbnail?: string
  source?: string
}

export interface ImageItem {
  url: string
  name: string
}

// 分页相关类型
export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// API 响应类型
export interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

// 用户角色
export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN'

// 课程状态
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED'

// 作业状态
export type AssignmentStatus = 'DRAFT' | 'PUBLISHED'

// 提交状态
export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'GRADED'

// 选择题选项
export interface QuestionOption {
  key: string
  text: string
}

// 题目
export interface Question {
  id: string
  question: string
  type: 'single_choice' | 'text'
  options?: QuestionOption[]
  answer?: string
}

// 文件上传结果
export interface UploadResult {
  url: string
  name: string
  size: number
}
