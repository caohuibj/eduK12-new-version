import type { CognitiveSession } from '../cognitive/types'

export type CompositeItemType = 'SCALE' | 'COGNITIVE' | 'FORM'

export interface CompositeItemSummary {
  id: string
  type: CompositeItemType
  position: number
  label: string | null
  completed: boolean
  index: number
}

export interface CompositeScaleItem {
  id: string
  itemCode: string
  content: string
  required: boolean
  options: Array<{ value: number; label: string }> | null
}

export interface CompositeScale {
  id: string
  name: string
  instruction: string | null
  estimatedTime: number | null
  config: { points?: number; labels?: Array<{ value: number; label: string }> } | null
  items: CompositeScaleItem[]
  dimensions: Array<{ id: string; name: string }>
}

export interface CompositeCurrentItem {
  id: string
  type: CompositeItemType
  position: number
  required: boolean
  form?: { type: string; label: string; placeholder: string | null; options: Array<{ value: string; label: string }> | null; value: string | null }
  scale?: CompositeScale
  scaleAssessmentId?: string
  answers?: Array<{ itemId: string; value: number; responseTime?: number }>
  cognitiveSession?: CognitiveSession
}

export interface CompositeAttemptState {
  id: string
  assessmentId: string
  name: string
  instruction: string | null
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
  progress: number
  completedItems: number
  totalItems: number
  currentIndex: number
  startedAt: string
  lastSavedAt: string
  completedAt: string | null
  anonymousCode: string | null
  items: CompositeItemSummary[]
  currentItem: CompositeCurrentItem | null
}

export interface CompositePublicInfo {
  id: string
  name: string
  description: string | null
  instruction: string | null
  expiresAt: string
  maxUses: number
  usedCount: number
  items: Array<{ type: CompositeItemType; position: number; label: string | null }>
}

export interface CompositeReport {
  id: string
  assessmentId: string
  name: string
  anonymousCode: string | null
  completedAt: string | null
  totalTime: number | null
  modules: Array<Record<string, unknown> & { itemId: string; type: CompositeItemType; label: string | null; decryptError?: boolean }>
}

export interface CompositeAttemptCounts {
  started: number
  inProgress: number
  completed: number
  abandoned: number
}

export type CompositeAttemptListStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'

export interface CompositeTeacherAttemptRow {
  id: string
  status: CompositeAttemptListStatus
  progress: number
  completedItems: number
  startedAt: string
  lastSavedAt: string
  completedAt: string | null
  totalTime: number | null
  isAnonymous: boolean
  anonymousCode: string | null
  nickname: string | null
  username: string | null
  displayName: string | null
  userId: string | null
}

export interface CompositeTeacherAttemptsResponse {
  assessment: { id: string; name: string; code: string; status: string; courseId: string | null }
  attemptCounts: CompositeAttemptCounts
  list: CompositeTeacherAttemptRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface CompositeCourseRef {
  id: string
  title: string
  courseCode?: string
  isLibrary: boolean
}

export interface CompositeTeacherListItem {
  id: string
  code: string
  name: string
  description?: string | null
  status: string
  itemCount: number
  copyable: boolean
  canSetCopyable: boolean
  createdBy: string
  creator: { id: string; role: string } | null
  course: CompositeCourseRef | null
  attemptCounts?: CompositeAttemptCounts
  items?: Array<{
    type: CompositeItemType
    position: number
    label?: string | null
    scale?: { name?: string } | null
    cognitiveAssignment?: { title?: string } | null
    form?: { label?: string } | null
  }>
}

export interface CompositeLibraryTemplate {
  id: string
  code: string
  name: string
  description: string | null
  items: Array<{ type: CompositeItemType; position: number; label: string | null }>
}
