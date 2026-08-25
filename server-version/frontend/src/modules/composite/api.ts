import apiClient from '../../api/client'
import type {
  AnalysisProtocolCatalog,
  AnalysisProtocolSelection,
  ReportPackageCatalog,
  ReportPackageProfile,
  CompositeAttemptState,
  CompositeLibraryTemplate,
  CompositePublicInfo,
  CompositeReport,
  CompositeSnapshotMetadata,
  CompositeTeacherAttemptsResponse,
  CompositeTeacherListItem,
} from './types'

export const compositeApi = {
  list: () => apiClient.get<{ list: CompositeTeacherListItem[] }>('/composite-assessments'),
  listAnalysisProtocols: () => apiClient.get<AnalysisProtocolCatalog>('/composite-assessments/analysis-protocols'),
  listReportPackages: () => apiClient.get<ReportPackageCatalog>('/composite-assessments/report-packages'),
  listLibrary: () => apiClient.get<{ list: CompositeLibraryTemplate[] }>('/composite-assessments/library'),
  copy: (id: string, input: { courseId?: string | null; code?: string; name?: string } = {}) =>
    apiClient.post<{ id: string }>(`/composite-assessments/${id}/copy`, input),
  detail: (id: string) => apiClient.get<any>(`/composite-assessments/${id}`),
  create: (input: Record<string, unknown>) => apiClient.post<any>('/composite-assessments', input),
  update: (id: string, input: Record<string, unknown>) => apiClient.patch<any>(`/composite-assessments/${id}`, input),
  setAnalysisProtocol: (id: string, analysisProtocol: AnalysisProtocolSelection | null) =>
    apiClient.put<any>(`/composite-assessments/${id}/analysis-protocol`, { analysisProtocol }),
  setReportPackage: (id: string, reportPackage: { key: string; version: string; profile: ReportPackageProfile } | null) =>
    apiClient.put<any>(`/composite-assessments/${id}/report-package`, { reportPackage }),
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
  save: (attemptId: string, draft?: { itemId: string; value: string }) => apiClient.post(`/composite-assessments/attempts/${attemptId}/save`, draft || {}),
  scaleAnswer: (attemptId: string, itemId: string, item: { itemId: string; value: number; responseTime?: number }) => apiClient.post<CompositeAttemptState>(`/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/answer`, item),
  completeScale: (attemptId: string, itemId: string) => apiClient.post<CompositeAttemptState>(`/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/complete`, {}),
  formAnswer: (attemptId: string, itemId: string, value: string) => apiClient.post<CompositeAttemptState>(`/composite-assessments/attempts/${attemptId}/items/${itemId}/form-answer`, { itemId, value }),
  report: (attemptId: string) => apiClient.get<CompositeReport>(`/composite-assessments/attempts/${attemptId}/report`),
  snapshots: (attemptId: string) => apiClient.get<{ list: CompositeSnapshotMetadata[]; total: number }>(`/composite-assessments/attempts/${attemptId}/snapshots`),
  reanalyze: (attemptId: string) => apiClient.post<CompositeSnapshotMetadata>(`/composite-assessments/attempts/${attemptId}/reanalyze`, {}),
  attempts: (id: string, query: { status?: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'; q?: string; page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams()
    if (query.status) params.set('status', query.status)
    const q = query.q?.trim()
    if (q) params.set('q', q)
    if (query.page) params.set('page', String(query.page))
    if (query.pageSize) params.set('pageSize', String(query.pageSize))
    const qs = params.toString()
    return apiClient.get<CompositeTeacherAttemptsResponse>(`/composite-assessments/${id}/attempts${qs ? `?${qs}` : ''}`)
  },
  teacherReport: (compositeId: string, attemptId: string, snapshotId?: string) => {
    const query = snapshotId ? `?${new URLSearchParams({ snapshotId }).toString()}` : ''
    return apiClient.get<CompositeReport>(`/composite-assessments/${compositeId}/attempts/${attemptId}/report${query}`)
  },
}

export const publicCompositeApi = (recoveryToken: string) => ({
  info: (token: string) => apiClient.get<CompositePublicInfo>(`/public/composite-assessments/${token}`),
  start: (token: string, resumeToken?: string) => apiClient.post<{ attempt: CompositeAttemptState; recoveryToken: string | null }>(`/public/composite-assessments/${token}/start`, resumeToken ? { recoveryToken: resumeToken } : {}),
  getAttempt: (attemptId: string) => apiClient.get<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}`, { headers: { 'X-Recovery-Token': recoveryToken } }),
  save: (attemptId: string, draft?: { itemId: string; value: string }) => apiClient.post(`/public/composite-assessments/attempts/${attemptId}/save`, draft || {}, { headers: { 'X-Recovery-Token': recoveryToken } }),
  scaleAnswer: (attemptId: string, itemId: string, item: { itemId: string; value: number; responseTime?: number }) => apiClient.post<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/answer`, { ...item, recoveryToken }),
  completeScale: (attemptId: string, itemId: string) => apiClient.post<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}/items/${itemId}/scale/complete`, { recoveryToken }),
  formAnswer: (attemptId: string, itemId: string, value: string) => apiClient.post<CompositeAttemptState>(`/public/composite-assessments/attempts/${attemptId}/items/${itemId}/form-answer`, { itemId, value, recoveryToken }),
  report: (attemptId: string) => apiClient.get<CompositeReport>(`/public/composite-assessments/attempts/${attemptId}/report`, { headers: { 'X-Recovery-Token': recoveryToken } }),
})
