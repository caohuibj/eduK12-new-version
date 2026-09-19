import apiClient from './client'

export type AssessmentRunStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED'
export type RunResourceFamily = 'BUNDLE' | 'SCALE' | 'FORM' | 'SITUATIONAL'
export type RunActorRole = 'STUDENT' | 'TEACHER' | 'PARENT' | 'COUNSELOR' | 'CLIENT'
export type RunRelationshipKind = 'SELF' | 'PARENT_CHILD' | 'COURSE_TEACHER_STUDENT' | 'CLASS_TEACHER_STUDENT' | 'COUNSELOR_CLIENT'
export type RunPerspective = 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
export type RunAnalysisMode = 'INDIVIDUAL_ONLY' | 'COHORT_AGGREGATE' | 'MULTI_INFORMANT_SYNTHESIS'
export type RunProgressState = 'NOT_STARTED' | 'STARTING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'UNKNOWN'

export type RunPopulationSelector =
  | { kind: 'ALL_CURRENT' }
  | { kind: 'MEMBERSHIP_IDS'; membershipIds: string[] }
  | { kind: 'CLASS_UNITS'; classUnitIds: string[] }
  | { kind: 'LABELS'; labelIds: string[]; match: 'ANY' | 'ALL' }
  | { kind: 'RELATED_PARENT' }

export interface RunRequestedPolicy {
  subjectRoles: string[]
  respondentRoles: string[]
  relationshipKinds: string[]
  perspectives: string[]
  analysisMode: string
  visibilityPolicyKey: string
  minimumRespondents: number | null
}

export interface AssessmentRunRecord {
  id: string
  organizationId: string
  name: string
  status: AssessmentRunStatus
  version: number
  createdByUserId: string
  intakeDeadline: string | null
  publishedAt: string | null
  closedAt: string | null
  cancelledAt: string | null
}

export interface AssessmentRunListItem extends AssessmentRunRecord {
  createdAt: string
  updatedAt: string
  trackCount: number
  executionCount: number
}

export interface AssessmentRunTrack {
  id: string
  resourceFamily: string
  resourceKey: string
  resourceVersion: string
  subjectSelector: RunPopulationSelector
  respondentSelector: RunPopulationSelector
  requestedPolicy: RunRequestedPolicy
  frozenResourcePolicy: unknown | null
  resourcePolicyHash: string | null
}

export interface AssessmentRunDetail {
  run: AssessmentRunListItem
  tracks: AssessmentRunTrack[]
  frozenPopulation: {
    actors: Array<{ provenanceKind: string; actorRole: string; count: number }>
    relationships: Array<{ relationshipKind: string; count: number }>
  }
  executions: Array<{ status: string; count: number }>
}

export interface RunProgressProjection {
  runId: string
  total: number
  counts: Record<RunProgressState, number>
  executions: Array<{
    executionId: string
    state: RunProgressState
    runtimeBindingKind: string | null
    runtimeBindingRef: string | null
  }>
}

export interface RunListPage {
  list: AssessmentRunListItem[]
  total: number
  page: number
  pageSize: number
}

const requireData = <T>(response: { code: number | string; message: string; data?: T }): T => {
  if (response.code !== 0 || response.data === undefined || response.data === null) {
    throw new Error(response.message || 'Run 服务响应无效')
  }
  return response.data
}

const runPath = (organizationId: string, runId?: string) => `/organizations/${encodeURIComponent(organizationId)}/runs${runId ? `/${encodeURIComponent(runId)}` : ''}`

export const runApi = {
  async list(organizationId: string, input: { page?: number; pageSize?: number; status?: AssessmentRunStatus } = {}): Promise<RunListPage> {
    return requireData(await apiClient.get<RunListPage>(runPath(organizationId), {
      params: {
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 50,
        ...(input.status ? { status: input.status } : {}),
      },
    }))
  },

  async detail(organizationId: string, runId: string): Promise<AssessmentRunDetail> {
    return requireData(await apiClient.get<AssessmentRunDetail>(runPath(organizationId, runId)))
  },

  async create(organizationId: string, input: { name: string; intakeDeadline?: string | null }): Promise<AssessmentRunRecord> {
    return requireData(await apiClient.post<AssessmentRunRecord>(runPath(organizationId), input))
  },

  async addTrack(organizationId: string, runId: string, input: {
    resource: { family: RunResourceFamily; key: string; version: string }
    subjectSelector: RunPopulationSelector
    respondentSelector: RunPopulationSelector
    requestedPolicy: RunRequestedPolicy
  }): Promise<AssessmentRunTrack> {
    return requireData(await apiClient.post<AssessmentRunTrack>(`${runPath(organizationId, runId)}/tracks`, input))
  },

  async publish(organizationId: string, runId: string, expectedVersion: number): Promise<{ runId: string; version: number; trackCount: number; executionCount: number }> {
    return requireData(await apiClient.post(`${runPath(organizationId, runId)}/publish`, { expectedVersion }))
  },

  async progress(organizationId: string, runId: string): Promise<RunProgressProjection> {
    return requireData(await apiClient.get<RunProgressProjection>(`${runPath(organizationId, runId)}/progress`))
  },

  async close(organizationId: string, runId: string): Promise<unknown> {
    return requireData(await apiClient.post(`${runPath(organizationId, runId)}/close`))
  },

  async cancel(organizationId: string, runId: string): Promise<unknown> {
    return requireData(await apiClient.post(`${runPath(organizationId, runId)}/cancel`))
  },
}
