import apiClient from './client'
import type { ExportArtifactRef } from '../utils/exportJobs'

export type TrainingAnalysisMode = 'PAIRWISE' | 'FULL_CASE'
export interface TrainingAnalysisMetric { itemId: string; metricKey: string; label?: string }
export interface TrainingAnalysisWave {
  waveKey: string
  taskId: string
  publication: string
  configDigest: string | null
  variantKey: string | null
  metrics: TrainingAnalysisMetric[]
}
export interface TrainingAnalysisSelector {
  schemaVersion: 1
  courseId: string
  waves: TrainingAnalysisWave[]
  mode: TrainingAnalysisMode
}
export interface TrainingAnalysisSource {
  taskId: string
  taskName: string
  publication: string
  configDigest: string | null
  variantKey: string | null
  metrics: TrainingAnalysisMetric[]
}
export interface TrainingAnalysisSources { list: TrainingAnalysisSource[]; total: number; canQuality: boolean; canExport: boolean }
export interface TrainingAnalysisManifest {
  schemaVersion: 1
  manifestHash: string
  definitionHash: string
  sourceHash: string
  qualityHash: string
  authorityHash: string
  sourceCutoff: string
  sourceCount: number
  observationCount: number
}
export interface TrainingAnalysisMeasurement {
  instrumentKey: string
  scoreKey: string
  scoringDigest: string
  responseSignature: string
  respondentType: string
  unit: string | null
  version: string
}
export interface TrainingAnalysisStatistics {
  mean: number | null
  median: number | null
  sdSample: number | null
  minMax: { min: number; max: number } | null
  quartiles: { q1: number; q2: number; q3: number } | null
}
export interface TrainingAnalysisDescriptive {
  waveKey: string
  taskId: string
  publication: string
  configDigest: string | null
  variantKey: string | null
  metricKey: string
  itemId: string
  measurement: TrainingAnalysisMeasurement | null
  state: 'present' | 'suppressed'
  eligibleN?: number
  validN?: number
  missingByReason?: Record<string, number>
  statistics?: TrainingAnalysisStatistics
}
export interface TrainingAnalysisMatched {
  metricKey: string
  state: 'present' | 'suppressed' | 'not_comparable'
  countKind: 'PAIRED_VALID' | 'COMPLETE_CASE'
  validCaseN?: number
  waveMeans?: Array<{ waveId: string; waveKey: string; mean: number }>
  comparisons?: Array<{
    fromWaveId: string
    toWaveId: string
    comparability: { level: string; allowedOperations: string[]; limitations: string[] }
    delta?: number
  }>
  reason?: string
  flow?: Array<{
    fromWaveKey: string
    toWaveKey: string
    state: 'present' | 'suppressed'
    basis: 'OBSERVED_SAMPLE'
    fromObservedN?: number
    toObservedN?: number
    retainedN?: number
    attritionN?: number
    lateJoiningN?: number
  }>
}
export interface TrainingAnalysisProjection {
  schemaVersion: 1
  kind: 'TRAINING_NUMERIC_LONGITUDINAL'
  courseId: string
  mode: TrainingAnalysisMode
  minimumN: number
  state: 'present' | 'suppressed'
  matchedEligibleN?: number
  descriptives: TrainingAnalysisDescriptive[]
  metrics: TrainingAnalysisMatched[]
  limitations: string[]
}
export interface TrainingAnalysisQualityRow {
  attemptId: string
  attemptEpoch: number
  sourceHash: string
  status: string
  taskSatisfaction: string | null
  verdict: 'INCLUDE' | 'EXCLUDE'
  reason: string | null
  revision: number
}
export interface TrainingAnalysisQualityPage {
  list: TrainingAnalysisQualityRow[]
  total: number
  page: number
  pageSize: number
}
export interface TrainingAnalysisResult {
  manifest: TrainingAnalysisManifest
  analysis: TrainingAnalysisProjection
  quality: TrainingAnalysisQualityPage
}
export interface TrainingAnalysisQualityInput {
  selector: TrainingAnalysisSelector
  attemptId: string
  attemptEpoch: number
  sourceHash: string
  expectedRevision: number
  verdict: 'INCLUDE' | 'EXCLUDE'
  reason: string
}
export interface TrainingAnalysisExportInput {
  selector: TrainingAnalysisSelector
  manifest: TrainingAnalysisManifest
  layout: 'long' | 'wide' | 'dictionary'
  format: 'csv' | 'zip'
  requestKey: string
}

const base = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/training-analysis`
const requireData = <T>(response: { code: number | string; message?: string; data?: T }): T => {
  if (response.code !== 0 || response.data == null) {
    throw Object.assign(new Error(response.message || '课程分析服务响应无效'), { code: response.code })
  }
  return response.data
}

export const trainingAnalysisApi = {
  async sources(courseId: string): Promise<TrainingAnalysisSources> {
    const data = requireData(await apiClient.get<TrainingAnalysisSources>(`${base(courseId)}/sources`))
    if (!Array.isArray(data.list)) throw new Error('课程分析来源响应不完整')
    return data
  },
  async analyze(courseId: string, selector: TrainingAnalysisSelector): Promise<TrainingAnalysisResult> {
    return requireData(await apiClient.post<TrainingAnalysisResult>(base(courseId), { selector }))
  },
  async qualityPage(courseId: string, selector: TrainingAnalysisSelector, manifest: TrainingAnalysisManifest, page: number): Promise<TrainingAnalysisQualityPage> {
    return requireData(await apiClient.post<TrainingAnalysisQualityPage>(`${base(courseId)}/quality/list`, { selector, manifest, page }))
  },
  async updateQuality(courseId: string, input: TrainingAnalysisQualityInput): Promise<void> {
    const response = await apiClient.post(`${base(courseId)}/quality`, input)
    if (response.code !== 0) throw Object.assign(new Error(response.message || '保存数据质量判断失败'), { code: response.code })
  },
  async exportData(courseId: string, input: TrainingAnalysisExportInput): Promise<{ artifacts: ExportArtifactRef[] }> {
    return requireData(await apiClient.post<{ artifacts: ExportArtifactRef[] }>(`${base(courseId)}/exports`, input))
  },
}
