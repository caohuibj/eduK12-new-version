import apiClient from '../../api/client'
import type { CognitiveAssignmentSummary, CognitiveSession } from './types'

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
