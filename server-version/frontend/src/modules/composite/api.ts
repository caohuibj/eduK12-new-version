import apiClient from '../../api/client'
import type { CompositeAttemptState, CompositePublicInfo, CompositeReport } from './types'

export const compositeApi = {
  list: () => apiClient.get<{ list: any[] }>('/composite-assessments'),
  detail: (id: string) => apiClient.get<any>(`/composite-assessments/${id}`),
  create: (input: Record<string, unknown>) => apiClient.post<any>('/composite-assessments', input),
  update: (id: string, input: Record<string, unknown>) => apiClient.patch<any>(`/composite-assessments/${id}`, input),
  addItem: (id: string, input: Record<string, unknown>) => apiClient.post<any>(`/composite-assessments/${id}/items`, input),
  removeItem: (id: string, itemId: string) => apiClient.delete(`/composite-assessments/${id}/items/${itemId}`),
  reorderItems: (id: string, items: Array<{ id: string; position: number }>) => apiClient.post(`/composite-assessments/${id}/items/reorder`, { items }),
  publish: (id: string) => apiClient.post<any>(`/composite-assessments/${id}/publish`, {}),
  listTokens: (id: string) => apiClient.get<{ list: any[] }>(`/composite-assessments/${id}/public-tokens`),
  createToken: (id: string, input: { expiresAt: string; maxUses: number }) => apiClient.post<any>(`/composite-assessments/${id}/public-tokens`, input),
  disableToken: (id: string, tokenId: string) => apiClient.delete(`/composite-assessments/${id}/public-tokens/${tokenId}`),
  exportData: (id: string, input: { detail: 'summary' | 'full'; format: 'csv' | 'sav' }) => apiClient.post<any>(`/composite-assessments/${id}/export`, input),
  listAvailable: () => apiClient.get<{ list: Array<Record<string, unknown>> }>('/composite-assessments/available'),
  start: (assessmentId: string) => apiClient.post<{ attempt: CompositeAttemptState; recoveryToken: null }>(`/composite-assessments/${assessmentId}/attempts`),
  getAttempt: (attemptId: string) => apiClient.get<CompositeAttemptState>(`/composite-assessments/attempts/${attemptId}`),
  save: (attemptId: string) => apiClient.post(`/composite-assessments/attempts/${attemptId}/save`, {}),
  scaleAnswer: (attemptId: string, itemId: string, item: { itemId: string; value: number; responseTime?: number }) => apiClient.post<CompositeAttemptState>(`/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/answer`, item),
  completeScale: (attemptId: string, itemId: string) => apiClient.post<CompositeAttemptState>(`/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/complete`, {}),
  formAnswer: (attemptId: string, itemId: string, value: string) => apiClient.post<CompositeAttemptState>(`/composite-assessments/attempts/${attemptId}/items/${itemId}/form-answer`, { itemId, value }),
  report: (attemptId: string) => apiClient.get<CompositeReport>(`/composite-assessments/attempts/${attemptId}/report`),
}

export const publicCompositeApi = (recoveryToken: string) => ({
  info: (token: string) => apiClient.get<CompositePublicInfo>(`/public/composite-assessments/${token}`),
  start: (token: string, resumeToken?: string) => apiClient.post<{ attempt: CompositeAttemptState; recoveryToken: string | null }>(`/public/composite-assessments/${token}/start`, resumeToken ? { recoveryToken: resumeToken } : {}),
  getAttempt: (attemptId: string) => apiClient.get<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}`, { headers: { 'X-Recovery-Token': recoveryToken } }),
  save: (attemptId: string) => apiClient.post(`/public/composite-assessments/attempts/${attemptId}/save`, {}, { headers: { 'X-Recovery-Token': recoveryToken } }),
  scaleAnswer: (attemptId: string, itemId: string, item: { itemId: string; value: number; responseTime?: number }) => apiClient.post<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/answer`, { ...item, recoveryToken }),
  completeScale: (attemptId: string, itemId: string) => apiClient.post<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/complete`, { recoveryToken }),
  formAnswer: (attemptId: string, itemId: string, value: string) => apiClient.post<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}/items/${itemId}/form-answer`, { itemId, value, recoveryToken }),
  report: (attemptId: string) => apiClient.get<CompositeReport>(`/public/composite-assessments/attempts/${attemptId}/report`, { headers: { 'X-Recovery-Token': recoveryToken } }),
})
