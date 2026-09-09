import type { CognitiveSession } from '../cognitive/types'
import type { FormBackgroundReport } from '../reporting/types'
import type { SafeScaleUnitReport } from '../reporting/ScaleUnitReportCard'

export type CompositeItemType = 'SCALE' | 'COGNITIVE' | 'FORM' | 'FORM_SECTION' | 'SITUATIONAL'

export interface CompositeItemSummary {
  id: string
  type: CompositeItemType
  position: number
  label: string | null
  completed: boolean
  index: number
}

export type CompositeScaleResponseValue = string | number

export interface CompositeScaleRunnerItem {
  itemCode: string
  content: string
  type: string
  required: boolean
  sortOrder: number
  responseSetKey: string
  randomizeOptions: boolean
  options: Array<{ value: CompositeScaleResponseValue; label: string }>
}

export interface CompositeScaleDefinition {
  schemaVersion: 2
  respondentType: string
  display: { randomizeItems: boolean }
  items: CompositeScaleRunnerItem[]
}

/** @deprecated Relational v1 fields are kept optional for old authoring data only. */
export interface CompositeScaleItem {
  id?: string
  itemCode?: string
  content?: string
  required?: boolean
  options?: Array<{ value: CompositeScaleResponseValue; label: string }> | null
}

export interface CompositeScale {
  id: string
  name: string
  instruction?: string | null
  estimatedTime?: number | null
  definition?: CompositeScaleDefinition
  /** @deprecated v1 authoring fields. */
  config?: { points?: number; labels?: Array<{ value: number; label: string }> } | null
  /** @deprecated v1 authoring fields. */
  items?: CompositeScaleItem[]
  /** @deprecated v1 authoring fields. */
  dimensions?: Array<{ id: string; name: string }>
}

export interface CompositeCurrentItem {
  id: string
  type: CompositeItemType
  position: number
  required: boolean
  formSectionId?: string
  title?: string
  description?: string | null
  contextSection?: boolean
  definitionHash?: string
  status?: string
  formSection?: {
    id: string
    title: string
    description: string | null
    contextSection: boolean
    definitionHash: string
    status: string
    items: Array<{
      id: string
      type: string
      label: string
      placeholder: string | null
      options: Array<{ value: string; label: string }> | string | null
      required: boolean
      contextKey: string | null
      value: string | string[] | null
    }>
  }
  form?: { type: string; label: string; placeholder: string | null; options: Array<{ value: string; label: string }> | null; value: string | null; contextKey?: string | null }
  scale?: CompositeScale
  scaleAssessmentId?: string
  answers?: Array<{
    itemCode?: string
    responseValue?: CompositeScaleResponseValue
    responseTimeMs?: number
    changeCount?: number
    formItemId?: string
    type?: string
    label?: string
    placeholder?: string | null
    options?: Array<{ value: string; label: string }> | string | null
    value?: string | string[] | null
    contextKey?: string | null
  }>
  formAnswers?: Array<{ formItemId: string; type: string; label: string; placeholder: string | null; options: Array<{ value: string; label: string }> | string | null; required: boolean; contextKey: string | null; value: string | string[] | null }>
  cognitiveSession?: CognitiveSession
  situationalAttemptId?: string
  situationalInstrumentKey?: string
  situationalInstrumentVersion?: string
  instrument?: {
    key: string
    version: string
    definitionHash: string
    compiledRuntimeHash: string
    scoringVersion: string
    definition: unknown
    runtimeCapabilities?: Record<string, boolean>
  }
}

export interface CompositeAttemptState {
  id: string
  assessmentId: string
  name: string
  instruction: string | null
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
  progress: number
  completedItems: number
  totalItems: number
  currentIndex: number
  startedAt: string
  lastSavedAt: string
  completedAt: string | null
  anonymousCode: string | null
  items: CompositeItemSummary[]
  currentItem: CompositeCurrentItem | null
  context?: { status: 'collecting' | 'frozen'; frozenAt: string | null; snapshotHash?: string | null }
  deliveryMode?: 'FINAL_ONLY' | 'LEGACY'
  attemptEpoch?: number
  definitionHash?: string
  contextSnapshotHash?: string | null
  units?: Array<{ id: string; type: CompositeItemType; position: number; required: boolean; label: string; completed: boolean; index: number; formSectionId?: string; itemId?: string }>
  formSections?: Array<NonNullable<CompositeCurrentItem['formSection']> & { position: number; submittedAt: string | null }>
}

export interface CompositeMutationAck {
  saved?: boolean
  completed?: boolean
  finalized?: boolean
}

export interface CompositePublicInfo {
  id: string
  name: string
  description: string | null
  instruction: string | null
  expiresAt: string
  maxUses: number
  usedCount: number
  items: Array<{ type: CompositeItemType; position: number; label: string | null }>
}

export interface CompositePublicAccessToken {
  id: string
  token: string
  expiresAt: string
  maxUses: number
  usedCount: number
  isActive: boolean
  createdAt: string
}

export type CompositeReportAudience = 'participant' | 'teacher' | 'researcher'

export type CompositeAnalysisExportFormat = 'json' | 'zip' | 'xlsx'

export interface CompositeAnalysisExportDownload {
  blob: Blob
  fileName: string
}

export interface CompositeSnapshotMetadata {
  id: string
  attemptId: string
  packageKey: string
  packageVersion: string
  profile: 'standard' | 'research'
  analysisDefinitionVersion: string
  analysisProtocolKey: string
  analysisProtocolVersion: string
  analysisVersion: string
  reportSchemaVersion: string
  inputFingerprint?: string
  generationReason: 'COMPLETION' | 'REANALYSIS'
  generatedBy?: string | null
  createdAt: string
}

export interface CompositePackageDomain {
  domain: string
  label: string
  status: string
  consistency: string
  summary: string
  caveats: string[]
  facetCoverage?: Array<{
    facet: string
    evidenceCount: number
    interpretable: boolean
    directionClasses: string[]
  }>
  evidence?: Array<Record<string, unknown>>
  strengths?: string[]
  watchItems?: string[]
}

export interface CompositePackageReport {
  audience: CompositeReportAudience
  packageName: string
  packageKey: string
  packageVersion: string
  profile: 'standard' | 'research'
  snapshotId?: string
  snapshotCreatedAt?: string
  generationReason?: 'COMPLETION' | 'REANALYSIS'
  analysisDefinitionVersion?: string
  analysisProtocolKey?: string
  analysisProtocolVersion?: string
  analysisVersion?: string
  reportSchemaVersion?: string
  inputFingerprint?: string
  qualitySummary: {
    interpretableModules: number
    excludedModules: string[]
    warnings: string[]
  }
  cognitiveDomains: CompositePackageDomain[]
  recommendations: Array<{ priority: string; text: string; evidenceRefs?: string[]; ruleId?: string; construct?: string }>
  limitations: string[]
  sourceSummary?: Array<{
    sourceType: 'behavioral' | 'self_report'
    slotKey: string | null
    taskType: string | null
    facet: string | null
    role: 'primary' | 'supporting'
    interpretable: boolean
    qualityFlags: string[]
    directionClass: string
  }>
  qualityFlags?: string[]
  observationPrompts?: string[]
  evidence?: Array<Record<string, unknown>>
  crossSourceFindings?: Array<Record<string, unknown>>
  provenance?: Record<string, string>
}

export interface CompositeReport {
  id: string
  assessmentId: string
  name: string
  anonymousCode: string | null
  completedAt: string | null
  totalTime: number | null
  backgroundValues: FormBackgroundReport[]
  packageReport?: CompositePackageReport
  unitReports: Array<
    | SafeScaleUnitReport
    | (Record<string, unknown> & {
        itemId: string
        type: 'COGNITIVE'
        kind: 'cognitive'
        label: string | null
        decryptError?: boolean
        qualityState?: 'interpretable' | 'insufficient' | null
        testType?: string | null
        finishedAt?: string | null
        singleTaskReport?: Record<string, unknown> | null
      })
    | (Record<string, unknown> & {
        itemId: string
        type: 'SITUATIONAL'
        kind: 'situational'
        label: string | null
        instrumentKey?: string | null
        instrumentVersion?: string | null
        metrics: Array<{ key: string; value: number | null; unit?: string; quality?: string }>
        quality?: Record<string, unknown> | null
        qualityState?: string | null
        resultHash?: string | null
        completedAt?: string | null
        totalTime?: number | null
        decryptError?: boolean
      })
  >
}

export interface CompositeAttemptCounts {
  started: number
  inProgress: number
  completed: number
  abandoned: number
}

export type CompositeAttemptListStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'

export interface CompositeTeacherAttemptRow {
  id: string
  status: CompositeAttemptListStatus
  progress: number
  completedItems: number
  startedAt: string
  lastSavedAt: string
  completedAt: string | null
  totalTime: number | null
  isAnonymous: boolean
  anonymousCode: string | null
  nickname: string | null
  username: string | null
  displayName: string | null
  userId: string | null
}

export interface CompositeTeacherAttemptsResponse {
  assessment: { id: string; name: string; code: string; status: string; courseId: string | null }
  attemptCounts: CompositeAttemptCounts
  list: CompositeTeacherAttemptRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface CompositeCourseRef {
  id: string
  title: string
  courseCode?: string
  isLibrary: boolean
}

export interface CompositeTeacherListItem {
  id: string
  code: string
  name: string
  description?: string | null
  status: string
  itemCount: number
  copyable: boolean
  canSetCopyable: boolean
  createdBy: string
  creator: { id: string; role: string } | null
  course: CompositeCourseRef | null
  reportPackage?: CompositeReportPackage | null
  attemptCounts?: CompositeAttemptCounts
  items?: Array<{
    type: CompositeItemType
    position: number
    label?: string | null
    scale?: { name?: string } | null
    cognitiveAssignment?: { title?: string } | null
    form?: { label?: string } | null
  }>
}

export interface CompositeLibraryTemplate {
  id: string
  code: string
  name: string
  description: string | null
  items: Array<{ type: CompositeItemType; position: number; label: string | null }>
}

export type AnalysisProtocolProfile = 'standard' | 'research'

export interface AnalysisProtocolCatalogItem {
  key: string
  version: string
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  name: string
  description: string
  recommendedForCreate: boolean
  profiles: AnalysisProtocolProfile[]
  estimatedMinutes: Record<AnalysisProtocolProfile, [number, number]>
  outputDomains: string[]
  cognitiveSlots: Array<{
    key: string
    label: string
    position: number
    testType: string
  }>
  scaleSlots?: Array<{
    key: string
    label: string
    position: number
    type: 'SCALE'
    expectedScaleCode: string
    expectedDimensionCode: string
    mappingKey: string
    mappingVersion: string
    respondentType: 'participant_self_report'
    valueSelector: 'dimensionScore'
  }>
  disabledReason?: string
}

export interface AnalysisProtocolCatalog {
  domainDefinitionVersion: string
  evidenceMappingVersion: string
  domains: Array<{ key: string; label: string; description: string }>
  list: AnalysisProtocolCatalogItem[]
}

export type ReportPackageProfile = 'standard' | 'research'

export interface ReportPackageCatalogItem {
  key: string
  version: string
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  name: string
  description: string
  profiles: ReportPackageProfile[]
  estimatedMinutes: Record<ReportPackageProfile, [number, number]>
  reportDefinitionVersion: string
  analysisProtocolKey: string
  analysisProtocolVersion: string
  audience: Array<'participant' | 'teacher' | 'researcher'>
  granted: boolean
  disabledReason?: string | null
  slots: Array<{
    key: string
    label: string
    position: number
    required: true
    type: 'COGNITIVE' | 'SCALE'
    testType?: string
    configVersion?: string
    engineVersion?: string
    scoringVersion?: string
    mappingKey?: string
    mappingVersion?: string
    expectedScaleCode?: string
    expectedDimensionCode?: string
    respondentType?: 'participant_self_report'
    valueSelector?: 'dimensionScore'
  }>
}

export interface ReportPackageCatalog {
  list: ReportPackageCatalogItem[]
}

export interface CompositeReportPackage {
  key: string
  version: string
  profile: ReportPackageProfile | null
  frozen: boolean
}

export interface AnalysisProtocolSelection {
  key: string
  version: string
  profile: AnalysisProtocolProfile
}

export interface CompositeAnalysisProtocol extends AnalysisProtocolSelection {
  frozen: boolean
}
