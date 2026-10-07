import apiClient from './client'
export type ContentStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED' | 'RETIRED'
export type DescriptiveKind = 'INDIVIDUAL_LONGITUDINAL' | 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'
export interface RegisteredResource {
  id: string; status: ContentStatus; scale_id: string; resource_key: string; resource_version: string; created_by_user_id?: string
  entry: { applicability: { analysisMode: string }; title: string; description: string; resultDisclosure: { audiences: { SUBJECT: { metricKeys: string[] } } } }
}
export interface ManagedReportingSpec {
  id: string; specKey: string; version: number; status: ContentStatus; specHash: string; createdByUserId?: string
  definition: { analysisKind: DescriptiveKind; reportEvidenceCeiling: string; minimumCohortN?: number; metricRules: Array<{ metricId: string; sourceResourceKey: string }> }
}
async function data<T>(promise: Promise<{ code: number | string; message: string; data?: T }>): Promise<T> {
  const response = await promise
  if (response.code !== 0 || !response.data) throw new Error(response.message || '内容服务响应无效')
  return response.data
}
const root = '/organizations'
export const reportingContentApi = {
  resources: (page = 1) => data(apiClient.get<{ list: RegisteredResource[]; truncated: boolean; nextPage: number | null }>(`${root}/measurement-resources`, { params: { page } })),
  register: (scaleId: string, mode: 'INDIVIDUAL' | 'GROUP') => data(apiClient.post<RegisteredResource>(`${root}/measurement-resources`, { scaleId, mode })),
  transitionResource: (id: string, action: 'review' | 'publish' | 'retire') => data(apiClient.post<RegisteredResource>(`${root}/measurement-resources/${id}/${action}`)),
  specs: (page = 1) => data(apiClient.get<{ list: ManagedReportingSpec[]; nextPage: number | null }>(`${root}/reporting-specs`, { params: { page } })),
  createSpec: (input: { resourceId: string; specKey: string; version: number; analysisKind: DescriptiveKind; minimumN: number }) => data(apiClient.post<ManagedReportingSpec>(`${root}/reporting-specs/descriptive`, input)),
  transitionSpec: (id: string, action: 'review' | 'publish' | 'retire') => data(apiClient.post<ManagedReportingSpec>(`${root}/reporting-specs/${id}/${action}`)),
}
