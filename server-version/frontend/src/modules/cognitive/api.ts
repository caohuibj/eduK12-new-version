import apiClient, { sessionFetch } from '../../api/client'
import type { AssessmentVideoCapabilitySources } from '../assessment-media/types'
import type { CognitiveAssignmentSummary, CognitiveHistoryPage, CognitiveSession } from './types'
import type { AdministrationProvenanceV1 } from './core/administration-provenance'

export interface CognitiveSessionApi {
  getSession: (sessionId: string) => ReturnType<typeof apiClient.get<CognitiveSession>>
  loadAsset?: (sessionId: string, assetId: string) => Promise<Blob>
  issueVideoCapabilities?: (sessionId: string, videoKey: string) => ReturnType<typeof apiClient.post<AssessmentVideoCapabilitySources>>
  restartSession?: (sessionId: string) => ReturnType<typeof apiClient.post<CognitiveSession | { session: CognitiveSession; recoveryToken: string | null }>>
  appendTrial: (sessionId: string, trialIndex: number, payload: unknown) => ReturnType<typeof apiClient.post<{ trialId: string; trialIndex: number; createdAt: string }>>
  appendTrials?: (sessionId: string, trials: Array<{ trialIndex: number; payload: unknown }>) => ReturnType<typeof apiClient.post<{ saved: number; trials: Array<{ trialId: string; trialIndex: number; createdAt: string }> }>>
  completeSession: (sessionId: string) => ReturnType<typeof apiClient.post<CognitiveSession>>
  submitFinal?: (sessionId: string, input: {
    submissionId: string
    attemptEpoch: number
    definitionHash: string
    contextSnapshotHash?: string | null
    trials: unknown[]
    administrationProvenance?: AdministrationProvenanceV1
  }) => ReturnType<typeof apiClient.post<any>>
}

const loadSessionAsset = async (
  path: string,
  headers?: Record<string, string>,
): Promise<Blob> => {
  const response = await sessionFetch(path, headers ? { headers } : undefined)
  if (!response.ok) throw Object.assign(new Error('认知测评视觉内容加载失败'), { status: response.status })
  return response.blob()
}

/**
 * Cognitive API 封装（Stage B v1.1 §14/§15）。
 *
 * 硬性约束（v1.1 §14）：
 *  - **必须复用现有 `src/api/client.ts` 的 apiClient**（baseURL=/api、JWT、401 处理、ApiResponse<T>）。
 *  - 禁止：新建 axios 实例 / 重复读取 localStorage token / 复制 Authorization interceptor /
 *    复制 401 logout 逻辑 / 建立第二套 ApiResponse。
 *
 * 禁止为了 Fake UI 新增 backend endpoint（v1.1 §15）。
 */
export const cognitiveApi = {
  listTests: () =>
    apiClient.get<{ list: Array<{
      testType: string
      name: string
      engineVersion: string
      scoringVersion: string
      recommendedForCreate: boolean
      profiles: Array<{ profile: 'experience' | 'standard' | 'research'; estimatedMinutes: [number, number]; reportCaveats: string[] }>
      reportDefinition: { title: string; primaryMetrics: string[]; secondaryMetrics: string[]; showProductIndex?: boolean; disclaimer: string }
    }> }>('/cognitive/tests'),
  listConfigs: () =>
    apiClient.get<{ list: Array<{
      id: string
      testType: string
      configVersion: string
      name: string | null
      instruction: string | null
      engineVersion?: string
      scoringVersion?: string
      accessPolicy?: 'OPEN' | 'GRANT'
    }> }>('/cognitive/configs'),
  updateConfigAccessPolicy: (id: string, accessPolicy: 'OPEN' | 'GRANT') =>
    apiClient.patch<{ id: string; accessPolicy: 'OPEN' | 'GRANT' }>(`/cognitive/configs/${id}/access-policy`, { accessPolicy }),
  listTeacherAssignments: (status?: string, listedStandalone?: boolean) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (listedStandalone !== undefined) params.set('listedStandalone', String(listedStandalone))
    const query = params.toString()
    return apiClient.get<any>(`/cognitive/assignments${query ? `?${query}` : ''}`)
  },
  createAssignment: (body: {
    courseId: string
    configId: string
    title: string
    instruction?: string
    maxAttempts?: number
    profile?: 'experience' | 'standard' | 'research'
  }) => apiClient.post<any>('/cognitive/assignments', body),
  updateAssignment: (id: string, body: { title?: string; instruction?: string }) =>
    apiClient.patch<any>(`/cognitive/assignments/${id}`, body),
  publishAssignment: (id: string) =>
    apiClient.post<any>(`/cognitive/assignments/${id}/publish`, {}),
  archiveAssignment: (id: string) =>
    apiClient.post<any>(`/cognitive/assignments/${id}/archive`, {}),
  listPublicTokens: (id: string) =>
    apiClient.get<{ list: any[]; total: number }>(`/cognitive/assignments/${id}/public-tokens`),
  createPublicToken: (id: string, body: { expiresAt: string; maxUses: number }) =>
    apiClient.post<any>(`/cognitive/assignments/${id}/public-tokens`, body),
  disablePublicToken: (id: string, tokenId: string) =>
    apiClient.delete<any>(`/cognitive/assignments/${id}/public-tokens/${tokenId}`),
  exportData: (id: string, body: { detail: 'summary' | 'full' | 'research'; format: 'csv' | 'sav' | 'zip' | 'xlsx' }) =>
    apiClient.post<{ fileName: string }>(`/cognitive/assignments/${id}/export`, body),
  getMyAssignments: () =>
    apiClient.get<CognitiveAssignmentSummary[]>('/cognitive/assignments/my'),
  getAssignment: (id: string) =>
    apiClient.get<CognitiveAssignmentSummary>(`/cognitive/assignments/${id}`),
  getHistory: (page = 1, pageSize = 20) =>
    apiClient.get<CognitiveHistoryPage>(`/cognitive/history?page=${page}&pageSize=${pageSize}`),
  createSession: (assignmentId: string) =>
    apiClient.post<CognitiveSession>('/cognitive/sessions', { assignmentId }),
  getSession: (sessionId: string) =>
    apiClient.get<CognitiveSession>(`/cognitive/sessions/${sessionId}`),
  loadAsset: (sessionId: string, assetId: string) => loadSessionAsset(
    `/api/cognitive/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}/content`,
  ),
  issueVideoCapabilities: (sessionId: string, videoKey: string) =>
    apiClient.post<AssessmentVideoCapabilitySources>(`/cognitive/sessions/${sessionId}/video-capabilities`, { videoKey }),
  restartSession: (sessionId: string) =>
    apiClient.post<CognitiveSession>(`/cognitive/sessions/${sessionId}/restart`, {}),
  appendTrial: (sessionId: string, trialIndex: number, payload: unknown) =>
    apiClient.post<{ trialId: string; trialIndex: number; createdAt: string }>(
      `/cognitive/sessions/${sessionId}/trials`,
      { trialIndex, payload }
    ),
  appendTrials: (sessionId: string, trials: Array<{ trialIndex: number; payload: unknown }>) =>
    apiClient.post<{ saved: number; trials: Array<{ trialId: string; trialIndex: number; createdAt: string }> }>(
      `/cognitive/sessions/${sessionId}/trials/batch`,
      { trials },
    ),
  completeSession: (sessionId: string) =>
    apiClient.post<CognitiveSession>(`/cognitive/sessions/${sessionId}/complete`, {}),
  submitFinal: (sessionId: string, input: Parameters<NonNullable<CognitiveSessionApi['submitFinal']>>[1]) => apiClient.post<any>(`/cognitive/sessions/${sessionId}/submit`, input),
}

/** 公开匿名认知会话 API。恢复凭证只作为请求凭证，不写入 URL 路径。 */
export const publicCognitiveApi = (recoveryToken: string): CognitiveSessionApi => ({
  getSession: (sessionId) => apiClient.get<CognitiveSession>(`/public/cognitive/sessions/${sessionId}`, { headers: { 'X-Recovery-Token': recoveryToken } }),
  loadAsset: (sessionId, assetId) => loadSessionAsset(
    `/api/public/cognitive/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}/content`,
    { 'X-Recovery-Token': recoveryToken },
  ),
  issueVideoCapabilities: (sessionId, videoKey) => apiClient.post<AssessmentVideoCapabilitySources>(
    `/public/cognitive/sessions/${sessionId}/video-capabilities`,
    { videoKey },
    { headers: { 'X-Recovery-Token': recoveryToken } },
  ),
  restartSession: (sessionId) => apiClient.post<{ session: CognitiveSession; recoveryToken: string | null }>(`/public/cognitive/sessions/${sessionId}/restart`, { recoveryToken }),
  appendTrial: (sessionId, trialIndex, payload) => apiClient.post<{ trialId: string; trialIndex: number; createdAt: string }>(`/public/cognitive/sessions/${sessionId}/trials`, { recoveryToken, trialIndex, payload }),
  appendTrials: (sessionId, trials) => apiClient.post<{ saved: number; trials: Array<{ trialId: string; trialIndex: number; createdAt: string }> }>(`/public/cognitive/sessions/${sessionId}/trials/batch`, { recoveryToken, trials }),
  completeSession: (sessionId) => apiClient.post<CognitiveSession>(`/public/cognitive/sessions/${sessionId}/complete`, { recoveryToken }),
  submitFinal: (sessionId, input) => apiClient.post<any>(`/public/cognitive/sessions/${sessionId}/submit`, { ...input, recoveryToken }),
})

export const publicCognitiveAssignmentApi = {
  info: (token: string) => apiClient.get<{ title: string; instruction: string | null; testType: string; expiresAt: string; maxUses: number; usedCount: number }>(`/public/cognitive/assignments/${token}`),
  start: (token: string, recoveryToken?: string) => apiClient.post<{ session: CognitiveSession; recoveryToken: string | null; anonymousCode: string | null }>(`/public/cognitive/assignments/${token}/start`, recoveryToken ? { recoveryToken } : {}),
}
