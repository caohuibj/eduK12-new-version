import apiClient from './client'
export type ArchiveKind = 'assessments' | 'questionnaire-assessments'
export interface ArchiveRow {
  id: string; studentId: string; username: string; nickname: string | null
  instrumentId: string; instrumentName: string; status: string; progress: number
  startedAt: string; completedAt: string | null; totalTime: number | null
}
export type ArchiveDetail = ArchiveRow & {
  answers?: unknown; scores?: unknown; feedback?: unknown; aggregateReport?: unknown
  formAnswers?: Array<{ id: string; label: string; type: string; value: unknown }>
  assessments?: Array<{ id: string; scaleName: string; status: string }>
}
export const legacyArchiveApi = {
  overview: () => apiClient.get<{ assessments: number; questionnaireAssessments: number; formAnswers: number }>('/admin/legacy-archive/overview'),
  list: (kind: ArchiveKind, page: number, status: string) => apiClient.get<{ list: ArchiveRow[]; total: number; pageSize: number }>(
    '/admin/legacy-archive/' + kind + '?' + new URLSearchParams({ page: String(page), status }).toString()),
  detail: (kind: ArchiveKind, id: string) => apiClient.get<ArchiveDetail>('/admin/legacy-archive/' + kind + '/' + encodeURIComponent(id)),
}
