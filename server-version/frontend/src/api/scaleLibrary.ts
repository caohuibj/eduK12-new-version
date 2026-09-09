import apiClient from './client'

export type ScaleLibraryAvailabilityStatus = 'AVAILABLE' | 'RESTRICTED' | 'NOT_AVAILABLE'
export type ScaleLibraryRespondent = 'SELF' | 'PARENT' | 'TEACHER' | 'OBSERVER' | 'CLINICIAN'
export type ScaleLibraryReportLevel = 'L1_SCORE_ONLY' | 'L2_DESCRIPTIVE' | 'L3_REFERENCED_INTERPRETIVE'

export interface ScaleLibraryIdentity {
  instrumentKey: string
  instrumentVersion: string
  canonicalName: string
  abbreviation?: string
  instrumentFamily?: string
}

export interface ScaleLibraryEntry {
  identity: ScaleLibraryIdentity
  source: {
    title?: string
    citation?: string
    url?: string
    publicationYear?: number
  }
  construct: {
    primaryDomain: string
    secondaryDomains: string[]
    constructDefinition: string
    constructLevel: string
    constructOverlapTags: string[]
  }
  applicability: {
    minAge?: number
    maxAge?: number
    gradeRange?: { minGrade: number; maxGrade: number }
    populationNotes?: string
    respondentTypes: ScaleLibraryRespondent[]
    developmentalEvidence: string
  }
  administration: {
    itemCount: number
    estimatedMinutes: number
    administrationModes: string[]
    timeFrame: string
    requiredTraining: boolean
    itemOrderLocked: boolean
    responseFormatLocked: boolean
    layoutConstraints: string[]
  }
  intendedUse: {
    intendedUses: Array<{ use: string; evidenceStatus: string; notes?: string }>
    forbiddenUses: string[]
  }
  localization: {
    sourceLocale: string
    targetLocale: string
    localizationVersion: string
    adaptationMethod: string
    reviewStatus: string
    expertReviewStatus: string
    cognitiveDebriefStatus: string
  }
  rights: {
    status: string
    commercialNature: string
    locales: string[]
    territories: string[]
    validTo?: string
  }
  evidence: {
    recordCount: number
    status: string
    coverageText: string
  }
  references: {
    policy: 'none' | 'declared'
    packageReferenceCount: number
    applicabilityCount: number
    referenceVersions: string[]
    displayText: string
  }
  report: {
    maxEligibleLevel: ScaleLibraryReportLevel | null
    levels: Record<ScaleLibraryReportLevel, { eligible: boolean }>
    scoreCount: number
    dimensionLabels: string[]
    limitations: string[]
    disclaimer: string
  }
  availability: {
    status: ScaleLibraryAvailabilityStatus
    locale: string
    territory: string
    respondent: ScaleLibraryRespondent
    reasons: string[]
    launch?: { scaleId: string; route: string }
  }
  governance?: {
    catalogManifestVersion: number
    catalogStatus: string
    scientificMaturity: string
    bindingStatus: string
    packageReleaseStatus: string
    definitionHash: string
    evidence: Array<{
      evidenceId: string
      evidenceType: string
      population: string
      ageRange?: string
      locale: string
      territory: string
      sampleSize?: number
      studyDesign: string
      rating: string
      citation: string
      doi?: string
      url?: string
      notes?: string
    }>
    referenceApplicability: Array<Record<string, unknown>>
    gate: {
      publishable: boolean
      errors: string[]
      warnings: string[]
      reportEligibility: {
        maxEligibleLevel: ScaleLibraryReportLevel | null
        pilotWordingRequired: boolean
        requiredReferenceWording: string[]
        forbiddenClaims: string[]
      }
    }
    authorization?: { authorizationId: string; status: string; basis: string }
  }
}

export interface ScaleLibraryFilters {
  keyword?: string
  instrumentFamily?: string
  primaryDomain?: string
  secondaryDomain?: string
  respondent?: ScaleLibraryRespondent
  minAge?: number
  maxAge?: number
  minGrade?: number
  maxGrade?: number
  locale?: string
  territory?: string
  intendedUse?: string
  availability?: ScaleLibraryAvailabilityStatus
}

export interface ScaleLibraryListResponse {
  schemaVersion: 1
  generatedAt: string
  entries: ScaleLibraryEntry[]
}

const cleanParams = (filters: ScaleLibraryFilters): Record<string, string | number> => Object.entries(filters).reduce((result, [key, value]) => {
  if (value !== undefined && value !== '') result[key] = value
  return result
}, {} as Record<string, string | number>)

export const getScaleLibrary = async (filters: ScaleLibraryFilters = {}) => (
  apiClient.get<ScaleLibraryListResponse>('/scale-library', { params: cleanParams(filters) })
)

export const getScaleLibraryEntry = async (
  instrumentKey: string,
  instrumentVersion: string,
  filters: Pick<ScaleLibraryFilters, 'locale' | 'territory' | 'respondent'> = {},
) => (
  apiClient.get<{ entry: ScaleLibraryEntry }>(
    `/scale-library/${encodeURIComponent(instrumentKey)}/${encodeURIComponent(instrumentVersion)}`,
    { params: cleanParams(filters) },
  )
)
