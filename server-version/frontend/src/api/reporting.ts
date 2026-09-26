import apiClient from './client'

export type ReportingAnalysisKind = 'GROUP' | 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL' | 'PROTECTED_FEEDBACK' | 'INDIVIDUAL_LONGITUDINAL'
export type ReportingMaturity = 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'
export type ReportingResourceFamily = 'BUNDLE' | 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'

export interface PublishedReportingSpecSummary {
  specId: string
  specKey: string
  version: number
  analysisKind: ReportingAnalysisKind
  engineKey: string
  reportEvidenceCeiling: ReportingMaturity
  metricIds: string[]
  privacy: {
    minimumCohortN?: number
    minimumRespondentN?: number
    minimumContributorN?: number
  }
  publishedAt: string | null
}

export interface ReportingSourceSummary {
  runId: string
  runName: string
  runStatus: string
  publishedAt: string | null
  trackId: string
  resource: { family: string; key: string; version: string }
}

export interface ProtectedReportingSourceSummary extends ReportingSourceSummary {
  subject: { userId: string; membershipId: string | null }
  relationshipKind: string
  perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'
}

export interface ReportingSeriesDiscoveryItem {
  seriesId: string
  seriesKey: string
  scope: { schemaVersion: 1; resourceFamily: ReportingResourceFamily; resourceKey: string }
  createdAt: string
  waveCount: number
  wavesTruncated: boolean
  waves: Array<{
    waveId: string
    waveKey: string
    ordinal: number
    source: { runId: string; trackId: string }
    createdAt: string
  }>
}

export interface ReportingEvidenceProjection {
  level: ReportingMaturity
  limitations: string[]
}

export interface ReportingMetricProjection {
  state: 'present' | 'suppressed'
  validN?: number
  missingN?: number
  aggregations?: Record<string, unknown>
}

export interface GroupProjection {
  schemaVersion: 1
  kind: 'GROUP'
  state: 'present' | 'suppressed'
  eligibleN?: number
  resultContributorN?: number
  metrics?: Record<string, ReportingMetricProjection>
  evidence?: ReportingEvidenceProjection
}

export interface RepeatedProjection {
  schemaVersion: 1
  kind: 'REPEATED_COHORT'
  state: 'present' | 'suppressed'
  waves: Array<{
    waveId: string
    waveKey: string
    ordinal: number
    state: 'present' | 'suppressed'
    eligibleN?: number
    resultContributorN?: number
    metrics?: Record<string, ReportingMetricProjection>
    evidence: ReportingEvidenceProjection
  }>
  comparisons: Array<{
    fromWaveId: string
    toWaveId: string
    metrics: Record<string, {
      schemaVersion: 1
      metricId: string
      level: string
      allowedOperations: string[]
      evidenceRef: string | null
      evidenceHash: string | null
      limitations: string[]
    }>
  }>
  limitations: string[]
}

export interface MatchedProjection {
  schemaVersion: 1
  kind: 'MATCHED_LONGITUDINAL'
  mode: 'PAIRWISE' | 'FULL_CASE'
  state: 'present' | 'suppressed'
  waveIds: string[]
  matchedEligibleN?: number
  metrics?: Record<string, {
    state: 'present' | 'suppressed'
    countKind?: 'PAIRED_VALID' | 'COMPLETE_CASE'
    validCaseN?: number
    waveMeans?: Array<{ waveId: string; waveKey: string; mean: number }>
    comparisons?: Array<{
      fromWaveId: string
      toWaveId: string
      comparability: {
        schemaVersion: 1
        metricId: string
        level: string
        allowedOperations: string[]
        evidenceRef: string | null
        evidenceHash: string | null
        limitations: string[]
      }
      delta?: number
    }>
  }>
  evidence: ReportingEvidenceProjection
}

export interface ProtectedProjection {
  schemaVersion: 1
  kind: 'PROTECTED_FEEDBACK'
  policyDomain: 'ORG_PROTECTED_FEEDBACK_V1'
  state: 'present' | 'suppressed'
  metrics?: Record<string, { state: 'present' | 'suppressed'; aggregations?: Record<string, unknown> }>
  limitations: string[]
}

export interface IndividualProjection {
  schemaVersion: 1
  kind: 'INDIVIDUAL_LONGITUDINAL'
  state: 'present'
  waves: Array<{ waveId: string; waveKey: string; ordinal: number; evidence: ReportingEvidenceProjection;
    metrics: Record<string, { state: 'present'; value: number } | { state: 'missing'; reason: string }> }>
  comparisons: Array<{ fromWaveId: string; toWaveId: string; metrics: Record<string, {
    comparability: { level: string; limitations: string[]; allowedOperations: string[] }; delta?: number
  }> }>
  limitations: string[]
}
export type ReportingProjection = IndividualProjection | GroupProjection | RepeatedProjection | MatchedProjection | ProtectedProjection

export interface ReportingArtifactProjection {
  artifactId: string
  generatedAt: string
  projection: ReportingProjection
  evidence?: ReportingEvidenceProjection
}

const requireData = <T>(response: { code: number | string; message: string; data?: T }): T => {
  if (response.code !== 0 || response.data === undefined || response.data === null) {
    throw new Error(response.message || 'Reporting 服务响应无效')
  }
  return response.data
}

const base = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}/reporting`

export type CohortSelector = { schemaVersion: 2; combine: 'ALL'; clauses: Array<
  { kind: 'CLASS_UNITS'; classUnitIds: string[] } |
  { kind: 'LABELS'; labelIds: string[]; match: 'ANY' | 'ALL' } |
  { kind: 'MEMBERSHIP_IDS'; membershipIds: string[] }
> }
export interface CohortOptions {
  classes: Array<{ id: string; name: string }>
  dimensions: Array<{ id: string; key: string; name: string }>
  labels: Array<{ id: string; dimensionId: string; name: string }>
}

export const reportingApi = {
  async individualSubjects(organizationId: string, search = '', page = 1) {
    return requireData(await apiClient.get<{ list: Array<{ userId: string; name: string }>; nextPage: number | null }>(`${base(organizationId)}/individual-subjects`, { params: { search, page, pageSize: 50 } }))
  },
  async individualSources(organizationId: string, subjectUserId: string, page = 1) {
    return requireData(await apiClient.get<{ list: ReportingSourceSummary[]; nextPage: number | null }>(`${base(organizationId)}/individual-sources`, { params: { subjectUserId, page, pageSize: 100 } }))
  },
  async analyzeIndividual(organizationId: string, input: { subjectUserId: string; specId: string; sources: Array<{runId: string; trackId: string}> }) {
    return requireData(await apiClient.post<ReportingArtifactProjection>(`${base(organizationId)}/analyses`, { analysisKind: 'INDIVIDUAL_LONGITUDINAL', ...input }))
  },
  async cohortOptions(organizationId: string) {
    return requireData(await apiClient.get<CohortOptions>(`${base(organizationId)}/cohort-options`))
  },
  async analyzeAutomatic(organizationId: string, input: {
    analysisKind: 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'; specId: string
    sources: Array<{ runId: string; trackId: string }>; cohortSelector?: CohortSelector
    cohortStrategy: 'WAVE_SPECIFIC' | 'BASELINE_FIXED'; mode?: 'PAIRWISE' | 'FULL_CASE'
  }): Promise<ReportingArtifactProjection> {
    return requireData(await apiClient.post<ReportingArtifactProjection>(`${base(organizationId)}/analyses`, input))
  },
  async listSpecs(organizationId: string, analysisKind?: ReportingAnalysisKind) {
    return requireData(await apiClient.get<{ list: PublishedReportingSpecSummary[]; total: number; page: number; pageSize: number }>(`${base(organizationId)}/specs`, {
      params: { page: 1, pageSize: 100, ...(analysisKind ? { analysisKind } : {}) },
    }))
  },

  async listSources(organizationId: string, page = 1) {
    return requireData(await apiClient.get<{ list: ReportingSourceSummary[]; truncated: boolean; nextPage?: number | null }>(`${base(organizationId)}/sources`, { params: { page, pageSize: 100 } }))
  },

  async listProtectedSources(organizationId: string) {
    return requireData(await apiClient.get<{ list: ProtectedReportingSourceSummary[]; truncated: boolean }>(`${base(organizationId)}/protected-sources`))
  },

  async listSeries(organizationId: string) {
    return requireData(await apiClient.get<{ list: ReportingSeriesDiscoveryItem[]; total: number; page: number; pageSize: number; maxWavesPerSeries: number }>(`${base(organizationId)}/series`, {
      params: { page: 1, pageSize: 50 },
    }))
  },

  async createSeries(organizationId: string, input: { seriesKey: string; scope: { resourceFamily: ReportingResourceFamily; resourceKey: string } }) {
    return requireData(await apiClient.post<{ seriesId: string; seriesKey: string; scope: { schemaVersion: 1; resourceFamily: ReportingResourceFamily; resourceKey: string }; createdAt: string }>(`${base(organizationId)}/series`, input))
  },

  async bindWave(organizationId: string, seriesId: string, input: { waveKey: string; ordinal: number; runId: string; trackId: string }) {
    return requireData(await apiClient.post<{ waveId: string; waveKey: string; ordinal: number; source: { runId: string; trackId: string }; createdAt: string }>(`${base(organizationId)}/series/${encodeURIComponent(seriesId)}/waves`, input))
  },

  async analyzeGroup(organizationId: string, input: { runId: string; trackId: string; specId: string; cohortSelector?: CohortSelector }): Promise<ReportingArtifactProjection> {
    return requireData(await apiClient.post<ReportingArtifactProjection>(`${base(organizationId)}/analyses`, input))
  },

  async analyzeRepeated(organizationId: string, input: { seriesId: string; waveKeys: string[]; specId: string }): Promise<ReportingArtifactProjection> {
    return requireData(await apiClient.post<ReportingArtifactProjection>(`${base(organizationId)}/analyses`, { analysisKind: 'REPEATED_COHORT', ...input }))
  },

  async analyzeMatched(organizationId: string, input: { seriesId: string; waveKeys: string[]; specId: string; mode: 'PAIRWISE' | 'FULL_CASE' }): Promise<ReportingArtifactProjection> {
    return requireData(await apiClient.post<ReportingArtifactProjection>(`${base(organizationId)}/analyses`, { analysisKind: 'MATCHED_LONGITUDINAL', seriesId: input.seriesId, waveKeys: input.waveKeys, specId: input.specId, options: { mode: input.mode } }))
  },

  async analyzeProtected(organizationId: string, input: { runId: string; trackId: string; subjectUserId: string; relationshipKind: string; perspective: 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'; specId: string }): Promise<ReportingArtifactProjection> {
    return requireData(await apiClient.post<ReportingArtifactProjection>(`${base(organizationId)}/analyses`, { analysisKind: 'PROTECTED_FEEDBACK', ...input }))
  },

  async readArtifact(organizationId: string, artifactId: string): Promise<ReportingArtifactProjection> {
    return requireData(await apiClient.get<ReportingArtifactProjection>(`${base(organizationId)}/artifacts/${encodeURIComponent(artifactId)}`))
  },
}
