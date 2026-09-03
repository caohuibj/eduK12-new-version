import apiClient from './client'

export type InstrumentAuthorizationRow = {
  authorizationId: string
  version: number
  instrumentKey: string
  instrumentVersion: string
  status: string
  selfApprovalDeclaration: string | null
  scope: {
    commercialNature: string
    territories: string[]
    locales: string[]
  }
}

export const instrumentAuthorizationApi = {
  list: () => apiClient.get<any>('/admin/instrument-authorizations'),
  create: (body: Record<string, unknown>) => apiClient.post<any>('/admin/instrument-authorizations', body),
  approve: (authorizationId: string, selfApprovalDeclaration: string) => (
    apiClient.post<any>(`/admin/instrument-authorizations/${authorizationId}/approve`, {
      selfApprovalDeclaration,
    })
  ),
  publishPreviewWho5: (body: Record<string, unknown> = {}) => (
    apiClient.post<any>('/admin/instrument-authorizations/publish-preview/who5', body)
  ),
}
