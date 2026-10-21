import apiClient, { sessionFetch } from './client'

export type GovernanceMediaItem = { assetId: string; contentHash: string; mimeType: string; sizeBytes: number; assetVersion: string; usages: string[]; rights: 'AUTHOR_SHARED_FOR_BOUND_SCALE'; dependencyReleaseIds: string[] }
export type GovernanceMediaManifest = { schemaVersion: 1; releaseIds: string[]; items: GovernanceMediaItem[]; manifestHash: string }
export type GovernanceMediaConsent = { manifestHash: string; shareWithAuthorizedUsers: true }
export type GovernanceMediaContext = { kind: 'sources' | 'submissions' | 'entries'; id: string; releaseId?: string }
export type GovernanceProduct = 'TRAINING' | 'SURVEY'
export type SubmissionMetadata = { title: string; author: string; copyright: string; applicability: string; scoringDescription: string; reportDescription: string }
export type GovernanceCompatibility = { supportedEntrypoints: GovernanceProduct[]; compatibilityReasons?: Partial<Record<GovernanceProduct, string>> }
export type GovernanceSubmission = GovernanceCompatibility & { id: string; releaseId: string; product: GovernanceProduct; sourceId: string; version: number; metadata: SubmissionMetadata; dependencyReleaseIds: string[]; status: 'SUBMITTED' | 'WITHDRAWN' | 'RETURNED' | 'APPROVED'; reason?: string; createdAt: string }
export type GovernanceEntry = Omit<GovernanceSubmission, 'status'> & { submissionId: string; status: 'ACTIVE' | 'WITHDRAWN' | 'EMERGENCY_DISABLED' }
export type GovernanceCapabilities = { systemAdmin: boolean; canReview: boolean; reviewGrants: { grantId: string; releaseIds: string[] }[]; distributionGrants: { grantId: string; product: GovernanceProduct; releaseIds: string[] }[] }
export type GovernanceSource = { sourceId: string; product: GovernanceProduct; releases: (GovernanceCompatibility & { releaseId: string; version: string; contentHash: string; publishedAt: string; title: string; mediaManifest: GovernanceMediaManifest; defaults?: SubmissionMetadata; eligible: boolean; unavailableReason?: string })[]; defaults: SubmissionMetadata }
export type GovernanceUseGrant = { id: string; userId: string; product: GovernanceProduct; version: number; status: string }

async function request<T>(product: GovernanceProduct, path: string, payload?: unknown): Promise<T> {
  const url = `/${product.toLowerCase()}/scale-library-governance${path}`
  if (product === 'TRAINING') {
    const response = payload === undefined ? await apiClient.get<T>(url) : await apiClient.post<T>(url, payload)
    if (response.code !== 0 || response.data == null) throw new Error(response.message || '共用库操作失败')
    return response.data
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (payload !== undefined) {
    const tokenResponse = await fetch('/api/survey/auth/csrf', { credentials: 'same-origin' })
    if (!tokenResponse.ok) throw new Error('研究者安全令牌获取失败')
    const token = await tokenResponse.json() as { data?: { csrfToken?: string } }
    if (!token.data?.csrfToken) throw new Error('无法建立安全会话，请重新登录')
    headers['X-CSRF-Token'] = token.data.csrfToken
  }
  const response = await fetch('/api' + url, { method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) })
  const body = await response.json() as { code: number; data: T; message?: string }
  if (!response.ok || body.code !== 0 || body.data == null) throw new Error(body.message || '共用库操作失败')
  return body.data
}
export const governanceApi = (product: GovernanceProduct) => ({
  capabilities: () => request<GovernanceCapabilities>(product, '/capabilities'),
  source: (sourceId: string) => request<GovernanceSource>(product, '/sources/' + encodeURIComponent(sourceId)),
  submissions: (sourceId?: string) => request<{ list: GovernanceSubmission[] }>(product, '/submissions' + (sourceId ? '?sourceId=' + encodeURIComponent(sourceId) : '')),
  submit: (releaseId: string, metadata: SubmissionMetadata, requestId: string, mediaConsent?: GovernanceMediaConsent) => request<GovernanceSubmission>(product, '/submissions', { releaseId, metadata, requestId, dependencyReleaseIds: [], ...(mediaConsent ? { mediaConsent } : {}) }),
  withdraw: (row: GovernanceSubmission, reason: string) => request<GovernanceSubmission>(product, '/submissions/' + encodeURIComponent(row.id) + '/withdraw', { expectedVersion: row.version, reason }),
  submissionDetail: (id: string) => request<GovernanceSubmission & { snapshot: Record<string, unknown>; mediaManifest: GovernanceMediaManifest; release: { releaseId: string; version: string; contentHash: string }; dependencies: unknown[] }>(product, '/submissions/' + encodeURIComponent(id)),
  review: (row: GovernanceSubmission, decision: 'APPROVE' | 'RETURN', reason: string, grantId?: string) => request<GovernanceSubmission>(product, '/submissions/' + encodeURIComponent(row.id) + '/review', { expectedVersion: row.version, decision, reason, ...(grantId ? { grantId } : {}) }),
  entries: () => request<{ list: GovernanceEntry[] }>(product, '/entries'),
  setStatus: (row: GovernanceEntry, status: 'WITHDRAWN' | 'EMERGENCY_DISABLED', reason: string, grantId?: string) => request<GovernanceEntry>(product, '/entries/' + encodeURIComponent(row.id) + '/status', { expectedVersion: row.version, status, reason, ...(grantId ? { grantId } : {}) }),
  recipients: (entryId: string, targetProduct: GovernanceProduct, page = 1, keyword = '', grantId?: string) => request<{ list: { id: string; username: string; name?: string }[]; page: number; hasMore: boolean }>(product, '/entries/' + encodeURIComponent(entryId) + '/recipients?' + new URLSearchParams({ product: targetProduct, page: String(page), keyword, ...(grantId ? { grantId } : {}) }).toString()),
  grants: (entryId: string) => request<{ list: GovernanceUseGrant[] }>(product, '/entries/' + encodeURIComponent(entryId) + '/grants'),
  grant: (entryId: string, userId: string, targetProduct: GovernanceProduct, requestId: string, grantId?: string, expectedGrantVersion?: number) => request<GovernanceUseGrant>(product, '/entries/' + encodeURIComponent(entryId) + '/grants', { userId, product: targetProduct, requestId, ...(grantId ? { grantId } : {}), ...(expectedGrantVersion === undefined ? {} : { expectedGrantVersion }) }),
  revoke: (row: GovernanceUseGrant, reason: string) => request<GovernanceUseGrant>(product, '/grants/' + encodeURIComponent(row.id) + '/revoke', { expectedVersion: row.version, reason }),
})
export const submissionStatusLabel = { SUBMITTED: '待审核', WITHDRAWN: '已撤回', RETURNED: '已退回', APPROVED: '已批准入库' }

export async function previewGovernanceMedia(product: GovernanceProduct, context: GovernanceMediaContext, assetId: string): Promise<Blob> {
  const url = `/api/${product.toLowerCase()}/scale-library-governance/${context.kind}/${encodeURIComponent(context.id)}/media/${encodeURIComponent(assetId)}/preview` + (context.releaseId ? '?releaseId=' + encodeURIComponent(context.releaseId) : '')
  const response = product === 'TRAINING' ? await sessionFetch(url) : await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) throw new Error('无法读取获准的附件预览，请刷新核对授权与版本。')
  return response.blob()
}
export function capabilityGovernanceMedia(product: GovernanceProduct, context: GovernanceMediaContext, assetId: string) {
  return request<{ url: string; expiresAt: string }>(product, `/${context.kind}/${encodeURIComponent(context.id)}/media/${encodeURIComponent(assetId)}/capability` + (context.releaseId ? '?releaseId=' + encodeURIComponent(context.releaseId) : ''))
}
