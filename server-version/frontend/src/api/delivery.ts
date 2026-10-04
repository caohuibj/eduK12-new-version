import apiClient, { sessionFetch } from './client'

export type SafetyProjectionKind = 'FULL' | 'ACTION' | 'SUMMARY'
export type ReportingExportKind = 'AGGREGATE' | 'MEMBER' | 'SAFETY'

export interface OrganizationSafetyCaseSummary {
  caseId: string
  projection: SafetyProjectionKind
  status: string
  createdAt: string
  acknowledgedAt: string | null
  disposedAt: string | null
  ackDueAt?: string
  disposeDueAt?: string
}

export interface OrganizationSafetyCaseProjection {
  projection: SafetyProjectionKind
  data: Record<string, unknown>
}

export interface ReportingExportTicket {
  exportId: string
  expiresAt: string
}

const requireData = <T>(response: { code: number | string; message: string; data?: T }): T => {
  if (response.code !== 0 || response.data === undefined || response.data === null) {
    throw new Error(response.message || '数据导出服务响应无效')
  }
  return response.data
}

const root = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`

const filenameFromDisposition = (value: string | null, fallback: string): string => {
  if (!value) return fallback
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try { return decodeURIComponent(encoded) } catch { return fallback }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1] || fallback
}

export const deliveryApi = {
  async listSafetyCases(organizationId: string) {
    return requireData(await apiClient.get<{ list: OrganizationSafetyCaseSummary[]; truncated: boolean }>(`${root(organizationId)}/safety/cases`))
  },

  async readSafetyCase(organizationId: string, caseId: string): Promise<OrganizationSafetyCaseProjection> {
    return requireData(await apiClient.get<OrganizationSafetyCaseProjection>(`${root(organizationId)}/safety/cases/${encodeURIComponent(caseId)}`))
  },

  async createArtifactExport(organizationId: string, kind: 'AGGREGATE' | 'MEMBER', artifactId: string): Promise<ReportingExportTicket> {
    return requireData(await apiClient.post<ReportingExportTicket>(`${root(organizationId)}/reporting/exports`, { kind, artifactId }))
  },

  async createSafetyExport(organizationId: string, caseId: string): Promise<ReportingExportTicket> {
    return requireData(await apiClient.post<ReportingExportTicket>(`${root(organizationId)}/reporting/exports`, { kind: 'SAFETY', caseId }))
  },

  async downloadExport(organizationId: string, exportId: string): Promise<{ blob: Blob; filename: string }> {
    const response = await sessionFetch(`/api${root(organizationId)}/reporting/exports/${encodeURIComponent(exportId)}`)
    if (!response.ok) {
      let message = '导出文件不存在、已过期或当前权限已撤销'
      try {
        const body = await response.json() as { message?: string }
        if (body.message) message = body.message
      } catch { /* non-JSON error body */ }
      throw new Error(message)
    }
    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('Content-Disposition'), `report-${exportId}.csv`),
    }
  },
}
