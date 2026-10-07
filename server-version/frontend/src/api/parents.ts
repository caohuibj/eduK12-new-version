import apiClient from './client'
export interface Page<T> {
  list: T[]
  page: number
  pageSize: number
  hasMore?: boolean
  truncated?: boolean
}
export interface ParentLink {
  id: string
  status: 'PENDING' | 'ACTIVE' | 'REVOKED'
  title: string
  canApprove: boolean
  canRevoke: boolean
  canConsentReports: boolean
}
export interface Links {
  list: ParentLink[]
  canInvite: boolean
  canClaim: boolean
  truncated: boolean
}
export interface Child {
  childId: string
  relationshipId: string
  displayName: string
}
export interface Projection {
  audience: 'PARENT'
  title: string
  summary: string
  blocks: Array<{ title: string; text: string }>
  policy?: { mode: 'COMPLETION_ONLY' | 'EDUCATIONAL_SUMMARY' }
}
export interface Report extends Projection {
  schemaVersion: 1
  artifactId: string
  relationshipId: string
  mode: 'COMPLETION_ONLY' | 'EDUCATIONAL_SUMMARY'
  canRevoke: boolean
}
export interface ConsentPreview {
  legacy?: false
  relationshipId: string
  artifactId: string
  parentName: string
  projection: Projection
  publicationHash?: string
  consentVersion: string
  consentText: string
  commandKey: string
  consentStatus: 'ACCEPTED' | 'NOT_ACCEPTED'
  canConsent: boolean
  canRevoke: boolean
}
export interface WithdrawalPreview {
  legacy: true
  relationshipId: string
  artifactId: string
  parentName: string
  title: string
  canConsent: false
  canGrant: false
  canRevoke: boolean
}
export interface PublicationPreview {
  artifactId: string
  projection: Projection
  template: { key: string; version: string }
  previewHash: string
  expectedVersion: number
  commandKey: string
  allowedActions: string[]
}
export interface GrantOption {
  id: string
  relationshipId: string
  parentName: string
  commandKey: string
  allowedActions: string[]
}
const id = (value: string) => encodeURIComponent(value)
const data = <T>(response: {
  code: number | string
  data?: T
  message: string
}): T => {
  if (response.code !== 0 || response.data == null)
    throw new Error(response.message || '服务响应无效')
  return response.data
}
const get = async <T>(path: string, signal?: AbortSignal) =>
  data(await apiClient.get<T>(path, { signal }))
const post = async <T>(path: string, body: unknown) =>
  data(await apiClient.post<T>(path, body))
export const parentsApi = {
  links: (signal?: AbortSignal) => get<Links>('/parent-links', signal),
  consentText: (signal?: AbortSignal) =>
    get<{ version: string; text: string }>('/parent-links/consent', signal),
  invitationSources: (signal?: AbortSignal) =>
    get<{
      list: Array<{
        kind: 'COURSE' | 'ORGANIZATION'
        id: string
        title: string
      }>
      truncated: boolean
    }>('/parent-links/invitation-sources', signal),
  invite: (source: { courseId: string } | { organizationId: string }) =>
    post<{ inviteCode: string; expiresAt: string }>(
      '/parent-links/invitations',
      source,
    ),
  claim: (inviteCode: string) =>
    post<{ id: string; status: string }>('/parent-links/claims', {
      inviteCode,
    }),
  approve: (relationshipId: string, consentVersion: string) =>
    post(`/parent-links/${id(relationshipId)}/approve`, { consentVersion }),
  unlink: (relationshipId: string) =>
    post(`/parent-links/${id(relationshipId)}/revoke`, {
      reason: '用户确认解除关联',
    }),
  children: (page = 1, signal?: AbortSignal) =>
    get<Page<Child>>(`/parents/me/children?page=${page}&pageSize=20`, signal),
  overview: (childId: string, signal?: AbortSignal) =>
    get<{
      child: { id: string; displayName: string }
      relationshipId: string
      courses: Array<{ id: string; title: string }>
    }>(`/parents/me/children/${id(childId)}/overview`, signal),
  reports: (childId: string, page = 1, signal?: AbortSignal) =>
    get<Page<{ id: string; title: string; mode: string }>>(
      `/parents/me/children/${id(childId)}/reports?page=${page}&pageSize=20`,
      signal,
    ),
  report: (childId: string, artifactId: string, signal?: AbortSignal) =>
    get<Report>(
      `/parents/me/children/${id(childId)}/reports/${id(artifactId)}`,
      signal,
    ),
  reportOptions: (relationshipId: string, signal?: AbortSignal) =>
    get<{
      list: Array<{ id: string; title: string; canConsent: boolean; legacy?: boolean }>
      truncated: boolean
    }>(`/parent-links/${id(relationshipId)}/report-options`, signal),
  previewConsent: (
    relationshipId: string,
    artifactId: string,
    signal?: AbortSignal,
  ) =>
    get<ConsentPreview | WithdrawalPreview>(
      `/parent-links/${id(relationshipId)}/reports/${id(artifactId)}/consent`,
      signal,
    ),
  acceptConsent: (p: ConsentPreview) =>
    post(
      `/parent-links/${id(p.relationshipId)}/reports/${id(p.artifactId)}/consent`,
      {
        commandKey: p.commandKey,
        consentVersion: p.consentVersion,
        ...(p.publicationHash ? { publicationHash: p.publicationHash } : {}),
      },
    ),
  withdraw: (relationshipId: string, artifactId: string) =>
    post(
      `/parent-links/${id(relationshipId)}/reports/${id(artifactId)}/revoke`,
      { reason: '用户确认撤回本份报告授权' },
    ),
  publications: (organizationId: string, page = 1, signal?: AbortSignal) =>
    get<Page<{ id: string; title: string; generatedAt: string }>>(
      `/parent-report-publications?organizationId=${id(organizationId)}&page=${page}&pageSize=20`,
      signal,
    ),
  templates: (artifactId: string, signal?: AbortSignal) =>
    get<{
      list: Array<{ key: string; version: string; title: string; mode: string }>
    }>(`/parent-report-publications/${id(artifactId)}/templates`, signal),
  previewPublication: (
    artifactId: string,
    templateKey?: string,
    templateVersion?: string,
  ) =>
    post<PublicationPreview>(
      `/parent-report-publications/${id(artifactId)}/preview`,
      templateKey ? { templateKey, templateVersion } : {},
    ),
  publish: (p: PublicationPreview) =>
    post(`/parent-report-publications/${id(p.artifactId)}/publish`, {
      templateKey: p.template.key,
      templateVersion: p.template.version,
      previewHash: p.previewHash,
      expectedVersion: p.expectedVersion,
      commandKey: p.commandKey,
    }),
  consents: (artifactId: string, signal?: AbortSignal) =>
    get<{
      artifactId: string
      projection: Projection
      list: GrantOption[]
      truncated: boolean
    }>(`/parent-report-publications/${id(artifactId)}/consents`, signal),
  grant: (artifactId: string, row: GrantOption) =>
    post(
      `/parent-links/${id(row.relationshipId)}/reports/${id(artifactId)}/grants`,
      { consentId: row.id, commandKey: row.commandKey },
    ),
}
