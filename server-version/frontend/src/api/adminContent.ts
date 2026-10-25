import api from './client'

export type ContentCapability = 'reference.analyze' | 'reference.review' | 'reference.publish' | 'report.edit' | 'report.publish' | 'data.reinterpret' | 'measurement.publish' | 'catalog.manage' | 'material.distribute'
export type AdminContentGrant = {
  subjectId: string
  scope: {
    product: 'SURVEY' | 'TRAINING'
    scopeKind: 'PROJECT' | 'COURSE' | 'PLATFORM'
    scopeId: string
    resourceKind: 'reference' | 'data' | 'report' | 'measurement' | 'catalog' | 'material'
    resourceKeys: string[]
  }
  capabilities: ContentCapability[]
  delegableCapabilities: ContentCapability[]
  remainingDelegationDepth: number
  validFrom: string
  expiresAt: string
}
export type AdminContentRootRequest = {requestId: string; expectedVersion: 0; reason: string; grant: AdminContentGrant}
export type AdminContentGrantMetadata = AdminContentGrant & {grantId: string; version: number; parentGrantId: string | null; issuerId: string; revokedAt: string | null}
export type StaticSjtSource = {instrumentKey: string; instrumentVersion: string}
export type StaticSjtMapping = StaticSjtSource & {mappingId: string; contentDigest: string; measurementReleaseId: string | null}
export type StaticSjtPublishRequest = {
  mappingId: string
  grantId: string
  deployment: {locale: string; territory: string}
}
export type StaticSjtPublishResult = {mappingId: string; measurementReleaseId: string; contentHash: string; status: string}
export const adminContentApi = {
  issue: (request: AdminContentRootRequest) => api.post<{grantId: string; version: number}>('/admin/permissions/content-grants', request),
  read: (grantId: string) => api.get<AdminContentGrantMetadata>('/admin/permissions/content-grants/' + grantId),
  revoke: (grantId: string, request: {expectedVersion: number; reason: string}) => api.post<{grantId: string; version: number}>('/admin/permissions/content-grants/' + grantId + '/revoke', request),
  prepareSjt: (request: StaticSjtSource) => api.post<StaticSjtMapping>('/admin/permissions/static-sjt/prepare', request),
  publishSjt: (request: StaticSjtPublishRequest) => api.post<StaticSjtPublishResult>('/admin/permissions/static-sjt/publish', request),
}
