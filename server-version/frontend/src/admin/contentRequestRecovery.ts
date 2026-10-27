import type {ApiClientError} from '../api/client'
import type {AdminContentGrant, AdminContentGrantMetadata, AdminContentRootRequest, StaticSjtMapping, StaticSjtPublishRequest, StaticSjtPublishResult, StaticSjtSource} from '../api/adminContent'

export const contentUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 240
const uuid = (value: unknown): value is string => typeof value === 'string' && contentUuid.test(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string')
export function isContentGrant(value: unknown): value is AdminContentGrant {
  if (!record(value) || !record(value.scope)) return false
  const scope = value.scope
  if (!uuid(value.subjectId) || !['SURVEY', 'TRAINING', 'SCHOOL', 'TEACHER'].includes(String(scope.product))
    || !['PROJECT', 'COURSE', 'PLATFORM', 'ORGANIZATION'].includes(String(scope.scopeKind)) || !text(scope.scopeId)
    || !strings(scope.resourceKeys) || !scope.resourceKeys.length || scope.resourceKeys.length > 128 || !scope.resourceKeys.every(uuid)
    || new Set(scope.resourceKeys).size !== scope.resourceKeys.length || !strings(value.capabilities) || !value.capabilities.length
    || new Set(value.capabilities).size !== value.capabilities.length || !strings(value.delegableCapabilities)
    || new Set(value.delegableCapabilities).size !== value.delegableCapabilities.length
    || typeof value.remainingDelegationDepth !== 'number' || ![0, 1].includes(value.remainingDelegationDepth)
    || value.remainingDelegationDepth === 0 && value.delegableCapabilities.length > 0
    || !value.delegableCapabilities.every(capability => (value.capabilities as string[]).includes(capability))
    || typeof value.validFrom !== 'string' || !Number.isFinite(Date.parse(value.validFrom))
    || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.parse(value.validFrom)) return false
  let allowed: string[] = []
  if (['SCHOOL','TEACHER'].includes(String(scope.product)) && scope.scopeKind === 'ORGANIZATION' && uuid(scope.scopeId)
    && scope.resourceKind === 'material' && value.remainingDelegationDepth === 0 && value.delegableCapabilities.length === 0) allowed=['material.distribute']
  if (scope.product === 'SURVEY' && scope.scopeKind === 'PROJECT' && uuid(scope.scopeId)) {
    if (scope.resourceKind === 'reference') allowed = ['reference.analyze', 'reference.review', 'reference.publish']
    if (scope.resourceKind === 'data') allowed = ['data.reinterpret']
  }
  if (scope.product === 'TRAINING' && scope.scopeKind === 'COURSE' && uuid(scope.scopeId)) {
    if (scope.resourceKind === 'report') allowed = ['report.edit', 'report.publish']
    if (scope.resourceKind === 'reference') allowed = ['reference.analyze', 'reference.review', 'reference.publish']
    if (scope.resourceKind === 'data') allowed = ['data.reinterpret']
  }
  if (scope.product === 'TRAINING' && scope.scopeKind === 'PLATFORM') {
    if (scope.scopeId === 'situational-registry' && scope.resourceKind === 'measurement') allowed = ['measurement.publish']
    if (scope.scopeId === 'reference-governance' && scope.resourceKind === 'reference') allowed = ['reference.review', 'reference.publish']
  }
  if (['TRAINING','SURVEY'].includes(String(scope.product)) && scope.scopeKind === 'PLATFORM' && scope.scopeId === 'scale-library-governance') {
    if (scope.product === 'TRAINING' && scope.resourceKind === 'catalog') allowed = ['catalog.manage']
    if (scope.resourceKind === 'material') allowed = ['material.distribute']
  }
  if (scope.product === 'SURVEY' && scope.scopeKind === 'PLATFORM' && scope.scopeId === 'situational-library-governance'
    && scope.resourceKind === 'material' && value.remainingDelegationDepth === 0 && value.delegableCapabilities.length === 0) {
    allowed = ['material.distribute']
  }
  return value.capabilities.every(capability => allowed.includes(capability))
}
export function isContentMetadata(value: unknown): value is AdminContentGrantMetadata {
  return record(value) && uuid(value.grantId) && uuid(value.issuerId)
    && (value.parentGrantId === null || uuid(value.parentGrantId)) && typeof value.version === 'number' && Number.isInteger(value.version) && value.version > 0
    && (value.revokedAt === null || typeof value.revokedAt === 'string' && Number.isFinite(Date.parse(value.revokedAt))) && isContentGrant(value)
}
export function isContentRequest(value: unknown): value is AdminContentRootRequest {
  return record(value) && uuid(value.requestId) && value.expectedVersion === 0 && typeof value.reason === 'string' && isContentGrant(value.grant)
}
export function isSjtSource(value: unknown): value is StaticSjtSource {
  return record(value) && text(value.instrumentKey) && text(value.instrumentVersion)
}
export function isSjtMapping(value: unknown): value is StaticSjtMapping {
  return record(value) && uuid(value.mappingId) && text(value.contentDigest)
    && (value.measurementReleaseId === null || uuid(value.measurementReleaseId)) && isSjtSource(value)
}
export function isSjtPublishRequest(value: unknown): value is StaticSjtPublishRequest {
  return record(value) && uuid(value.mappingId) && uuid(value.grantId) && record(value.deployment)
    && text(value.deployment.locale) && text(value.deployment.territory)
    && Object.keys(value.deployment).every(key => key === 'locale' || key === 'territory')
}
export function isSjtPublishResult(value: unknown): value is StaticSjtPublishResult {
  return record(value) && uuid(value.mappingId) && uuid(value.measurementReleaseId) && text(value.contentHash) && value.status === 'PUBLISHED'
}
export function requestFailure(error: unknown) {
  const failure = error as ApiClientError
  const message = typeof failure?.message === 'string' ? failure.message : '请求未完成'
  const stepUp = failure?.status === 401 || /安全密钥|重新登录|会话/.test(message)
  return {message, definiteRejection: [400, 403].includes(failure?.status ?? 0) && !stepUp,
    unknown: ![400, 401, 403, 409, 429].includes(failure?.status ?? 0)}
}
export function sameContentGrant(a: AdminContentGrant, b: AdminContentGrant) {
  const normalized = (grant: AdminContentGrant) => ({subjectId: grant.subjectId, scope: {product: grant.scope.product, scopeKind: grant.scope.scopeKind, scopeId: grant.scope.scopeId, resourceKind: grant.scope.resourceKind, resourceKeys: [...grant.scope.resourceKeys].sort()},
    capabilities: [...grant.capabilities].sort(), delegableCapabilities: [...grant.delegableCapabilities].sort(), remainingDelegationDepth: grant.remainingDelegationDepth,
    validFrom: new Date(grant.validFrom).toISOString(), expiresAt: new Date(grant.expiresAt).toISOString()})
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b))
}
export const localInputTime = (date?: string) => {
  if (!date) return ''
  const value = new Date(date)
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
