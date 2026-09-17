import apiClient from './client'
import type { CompositeAttemptState } from '../modules/composite/types'

export type RelationalResourceKind = 'BUNDLE' | 'SCALE' | 'FORM' | 'SITUATIONAL'
export type RelationalProductJourney =
  | 'PARENT_SELF_SERVE'
  | 'TEACHER_ASSIGN_PARENT'
  | 'TEACHER_OBSERVER'
  | 'STUDENT_EXPERIENCE'

export type RelationalProductRef = {
  resourceKind: RelationalResourceKind
  resourceKey: string
  resourceVersion: string
}

export type RelationalProduct = RelationalProductRef & {
  title: string
  description: string | null
  scienceMaturity: 'PILOT' | 'RESEARCH_READY'
  perspectives: Array<'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'>
  analysisMode: 'INDIVIDUAL_ONLY' | 'COHORT_AGGREGATE'
  minimumRespondents: number | null
  journeys: RelationalProductJourney[]
}

export type RelationalTask = RelationalProductRef & {
  assignmentId: string
  episodeId: string
  subjectUserId: string
  subjectRole: 'STUDENT' | 'TEACHER' | 'PARENT'
  respondentRole: 'STUDENT' | 'TEACHER' | 'PARENT'
  perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
  relationshipKind: 'SELF' | 'PARENT_CHILD' | 'COURSE_TEACHER_STUDENT'
  analysisMode: 'INDIVIDUAL_ONLY' | 'COHORT_AGGREGATE'
  minimumRespondents: number | null
  status: 'OPEN' | 'STARTED' | 'COMPLETED' | 'REVOKED' | 'EXPIRED'
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  consentRequired: boolean
  launchable: boolean
  product: RelationalProduct | null
}

export type ParentChild = { studentUserId: string; displayName: string }
export type TeacherRosterStudent = {
  studentUserId: string
  displayName: string
  approvedParents: Array<{ parentUserId: string; displayName: string }>
}
export type TeacherRoster = { courseId: string; title: string; roster: TeacherRosterStudent[] }
export type StudentCourseContext = {
  courseId: string
  title: string
  teacher: { userId: string; displayName: string }
}

const productPayload = (product: RelationalProductRef) => ({ ...product })

export const relationalApi = {
  async catalog(): Promise<RelationalProduct[]> {
    const response = await apiClient.get<{ list: RelationalProduct[] }>('/relational/catalog')
    return response.data.list
  },
  async tasks(): Promise<RelationalTask[]> {
    const response = await apiClient.get<{ list: RelationalTask[] }>('/relational/tasks')
    return response.data.list
  },
  async parentChildren(): Promise<ParentChild[]> {
    const response = await apiClient.get<{ list: ParentChild[] }>('/relational/context/parent-children')
    return response.data.list
  },
  async teacherRoster(courseId: string): Promise<TeacherRoster> {
    const response = await apiClient.get<TeacherRoster>(`/relational/context/courses/${encodeURIComponent(courseId)}/roster`)
    return response.data
  },
  async studentCourses(): Promise<StudentCourseContext[]> {
    const response = await apiClient.get<{ list: StudentCourseContext[] }>('/relational/context/student-courses')
    return response.data.list
  },
  async issueTeacherParent(input: {
    courseId: string
    studentUserId: string
    parentUserId: string
    product: RelationalProductRef
  }): Promise<RelationalTask> {
    const response = await apiClient.post<RelationalTask>('/relational/assignments/teacher-parent', {
      courseId: input.courseId,
      studentUserId: input.studentUserId,
      parentUserId: input.parentUserId,
      ...productPayload(input.product),
    })
    return response.data
  },
  async issueTeacherObserver(input: {
    courseId: string
    studentUserId: string
    product: RelationalProductRef
  }): Promise<RelationalTask> {
    const response = await apiClient.post<RelationalTask>('/relational/assignments/teacher-observer', {
      courseId: input.courseId,
      studentUserId: input.studentUserId,
      ...productPayload(input.product),
    })
    return response.data
  },
  async issueParentSelfServe(input: {
    studentUserId: string
    product: RelationalProductRef
  }): Promise<RelationalTask> {
    const response = await apiClient.post<RelationalTask>('/relational/assignments/parent-self-serve', {
      studentUserId: input.studentUserId,
      ...productPayload(input.product),
    })
    return response.data
  },
  async issueStudentExperience(input: {
    courseId: string
    product: RelationalProductRef
  }): Promise<RelationalTask> {
    const response = await apiClient.post<RelationalTask>('/relational/assignments/student-experience', {
      courseId: input.courseId,
      ...productPayload(input.product),
    })
    return response.data
  },
  async acceptConsent(assignmentId: string): Promise<{ accepted: boolean; replayed: boolean }> {
    const response = await apiClient.post<{ accepted: boolean; replayed: boolean }>(
      `/relational/assignments/${encodeURIComponent(assignmentId)}/consent/accept`,
    )
    return response.data
  },
  async reportTarget(assignmentId: string): Promise<{ attemptId: string }> {
    const response = await apiClient.get<{ attemptId: string }>(
      `/relational/assignments/${encodeURIComponent(assignmentId)}/report-target`,
    )
    return response.data
  },
  async start(assignmentId: string): Promise<{
    assignment: RelationalTask
    attempt: CompositeAttemptState
    replayed: boolean
  }> {
    const response = await apiClient.post<{
      assignment: RelationalTask
      attempt: CompositeAttemptState
      replayed: boolean
    }>(`/relational/assignments/${encodeURIComponent(assignmentId)}/start`)
    return response.data
  },
}
