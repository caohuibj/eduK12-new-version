import apiClient from '../../api/client'
import type { CognitiveAssignmentSummary, CognitiveHistoryPage, CognitiveSession } from './types'

export interface CognitiveSessionApi {
  getSession: (sessionId: string) => ReturnType<typeof apiClient.get<CognitiveSession>>
  appendTrial: (sessionId: string, trialIndex: number, payload: Record<string, unknown>) => ReturnType<typeof apiClient.post<{ trialId: string; trialIndex: number; createdAt: string }>>
  completeSession: (sessionId: string) => ReturnType<typeof apiClient.post<CognitiveSession>>
}

/**
 * Cognitive API 封装（Stage B v1.1 §14/§15）。
 *
 * 硬性约束（v1.1 §14）：
 *  - **必须复用现有 `src/api/client.ts` 的 apiClient**（baseURL=/api、JWT、401 处理、ApiResponse<T>）。
 *  - 禁止：新建 axios 实例 / 重复读取 localStorage token / 复制 Authorization interceptor /
 *    复制 401 logout 逻辑 / 建立第二套 ApiResponse。
 *  - 路径不带 `/api` 前缀（client baseURL 已含）。
 *
 * 禁止为了 Fake UI 新增 backend endpoint（v1.1 §15）。
 */

export const cognitiveApi = {
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
  restartSession: (sessionId: string) =>
    apiClient.post<CognitiveSession>(`/cognitive/sessions/${sessionId}/restart`, {}),
  appendTrial: (sessionId: string, trialIndex: number, payload: Record<string, unknown>) =>
    apiClient.post<{ trialId: string; trialIndex: number; createdAt: string }>(
      `/cognitive/sessions/${sessionId}/trials`,
      { trialIndex, payload }
    ),
  completeSession: (sessionId: string) =>
    apiClient.post<CognitiveSession>(`/cognitive/sessions/${sessionId}/complete`, {}),
}

/** 公开匿名认知会话 API。恢复凭证只作为请求凭证，不写入 URL 路径。 */
export const publicCognitiveApi = (recoveryToken: string): CognitiveSessionApi => ({
  getSession: (sessionId) => apiClient.get<CognitiveSession>(`/public/cognitive/sessions/${sessionId}`, { headers: { 'X-Recovery-Token': recoveryToken } }),
  appendTrial: (sessionId, trialIndex, payload) => apiClient.post<{ trialId: string; trialIndex: number; createdAt: string }>(`/public/cognitive/sessions/${sessionId}/trials`, { recoveryToken, trialIndex, payload }),
  completeSession: (sessionId) => apiClient.post<CognitiveSession>(`/public/cognitive/sessions/${sessionId}/complete`, { recoveryToken }),
})

export const publicCognitiveAssignmentApi = {
  info: (token: string) => apiClient.get<{ title: string; instruction: string | null; testType: string; expiresAt: string; maxUses: number; usedCount: number }>(`/public/cognitive/assignments/${token}`),
  start: (token: string, recoveryToken?: string) => apiClient.post<{ session: CognitiveSession; recoveryToken: string | null; anonymousCode: string | null }>(`/public/cognitive/assignments/${token}/start`, recoveryToken ? { recoveryToken } : {}),
}
