import {
  getScaleInstrumentLocalization,
  listScaleInstrumentSources,
} from '../onboarding/instrument-registry'
import { materializeCatalogManifest } from '../onboarding/validate-instrument'
import {
  buildScaleLibraryReadModel,
  filterScaleLibraryEntries,
  getScaleLibraryEntry,
  type ScaleLibraryEntry,
  type ScaleLibraryFilterInput,
  type ScaleLibraryReadModelContext,
} from './scale-library-read-model'
import type { ScaleEvidenceRecord } from './catalog-manifest'

export interface CatalogOnlyGovernance {
  catalogManifestVersion: number
  catalogStatus: string
  scientificMaturity: string
  bindingStatus: 'PACKAGE_MISSING'
  packageReleaseStatus: 'NOT_BUILT'
  definitionHash: 'NOT_APPLICABLE_CATALOG_ONLY'
  evidence: ScaleEvidenceRecord[]
  referenceApplicability: Array<Record<string, unknown>>
  gate: {
    publishable: false
    errors: string[]
    warnings: string[]
    reportEligibility: {
      maxEligibleLevel: null
      pilotWordingRequired: false
      requiredReferenceWording: string[]
      forbiddenClaims: string[]
    }
  }
  authorization?: { authorizationId: string; status: string; basis: string }
}
export type CatalogOnlyScaleLibraryEntry = Omit<ScaleLibraryEntry, 'governance'> & { governance?: CatalogOnlyGovernance }
export type UnifiedScaleLibraryEntry = ScaleLibraryEntry | CatalogOnlyScaleLibraryEntry
export interface UnifiedScaleLibraryReadModel {
  schemaVersion: 1
  generatedAt: string
  entries: UnifiedScaleLibraryEntry[]
  diagnostics: Array<{ severity: 'error' | 'warning'; code: string; message: string }>
}

/** Copyright permissions are not evaluated or represented as approved. */
const summarizeRights = (): ScaleLibraryEntry['rights'] => ({
  status: 'NOT_EVALUATED', commercialNature: 'UNSPECIFIED', locales: [], territories: [],
})

const buildCandidate = (source: ReturnType<typeof listScaleInstrumentSources>[number], context: ScaleLibraryReadModelContext, generatedAt: string): CatalogOnlyScaleLibraryEntry => {
  const manifest = materializeCatalogManifest(source)
  const localization = getScaleInstrumentLocalization(source.identity.instrumentKey, source.identity.instrumentVersion)
  const locale = context.locale ?? localization?.targetLocale ?? 'und'
  const territory = context.territory ?? 'CN'
  const respondent = context.respondent ?? manifest.population.respondentTypes[0]
  const rights = summarizeRights()
  const preview = source.candidatePreview
  const plan = preview?.reportPlan
  const respondentMatches = manifest.population.respondentTypes.includes(respondent)
  const localeMatches = localization ? localization.targetLocale === locale : false
  const reasons = [
    ...(preview?.blockers ?? ['EXECUTABLE_NOT_REGISTERED']),
    ...(!localization ? ['LOCALIZATION_MISSING'] : localization.reviewStatus !== 'APPROVED' ? ['LOCALIZATION_REVIEW_PENDING'] : []),
    ...(!respondentMatches ? ['RESPONDENT_NOT_APPLICABLE'] : []),
    ...(!localeMatches ? ['LOCALE_NOT_AVAILABLE'] : []),
  ]
  const entry: CatalogOnlyScaleLibraryEntry = {
    identity: { ...manifest.identity },
    source: { ...(preview?.source ?? {}) },
    construct: { ...manifest.construct, secondaryDomains: [...manifest.construct.secondaryDomains], constructOverlapTags: [...manifest.construct.constructOverlapTags] },
    applicability: { ...manifest.population, respondentTypes: [...manifest.population.respondentTypes] },
    administration: { ...manifest.administration, administrationModes: [...manifest.administration.administrationModes], layoutConstraints: [...manifest.administration.layoutConstraints] },
    intendedUse: { intendedUses: manifest.intendedUse.intendedUses.map(use => ({ ...use })), forbiddenUses: [...manifest.intendedUse.forbiddenUses] },
    localization: localization ? {
      sourceLocale: localization.sourceLocale,
      targetLocale: localization.targetLocale,
      localizationVersion: localization.localizationVersion,
      adaptationMethod: localization.adaptationMethod,
      reviewStatus: localization.reviewStatus,
      expertReviewStatus: localization.expertReviewStatus,
      cognitiveDebriefStatus: localization.cognitiveDebriefStatus,
    } : {
      sourceLocale: 'und', targetLocale: 'und', localizationVersion: '0.0.0',
      adaptationMethod: 'ORIGINAL_SOURCE', reviewStatus: 'PENDING',
      expertReviewStatus: 'NOT_ESTABLISHED', cognitiveDebriefStatus: 'NOT_ESTABLISHED',
    },
    rights,
    evidence: {
      recordCount: manifest.evidence.length,
      status: manifest.evidence.length ? 'EVIDENCE_RECORDED' : 'NO_EVIDENCE_RECORDED',
      coverageText: manifest.evidence.length
        ? '已记录 source-owned 科研证据；仅支持其明确样本与场域，不自动升级为常模、诊断或其他人群验证。'
        : '当前 source 未记录本地科研证据。',
    },
    references: {
      policy: 'none', packageReferenceCount: 0, applicabilityCount: manifest.referenceApplicability.length,
      referenceVersions: [], displayText: '当前没有 executable package 或激活 reference set。',
    },
    report: {
      maxEligibleLevel: null,
      levels: { L1_SCORE_ONLY: { eligible: false }, L2_DESCRIPTIVE: { eligible: false }, L3_REFERENCED_INTERPRETIVE: { eligible: false } },
      scoreCount: plan?.dimensionLabels.length ?? 0,
      dimensionLabels: plan?.dimensionLabels ?? [],
      limitations: plan?.limitations ?? ['当前没有 executable report contract。'],
      disclaimer: plan?.disclaimer ?? '当前条目仅用于科学目录发现，尚不可启动测评。',
    },
    availability: { status: 'NOT_AVAILABLE', locale, territory, respondent, reasons: [...new Set(reasons)] },
  }
  if (context.viewerRole === 'ADMIN') {
    entry.governance = {
      catalogManifestVersion: manifest.catalogManifestVersion,
      catalogStatus: manifest.catalogStatus,
      scientificMaturity: manifest.scientificMaturity,
      bindingStatus: 'PACKAGE_MISSING',
      packageReleaseStatus: 'NOT_BUILT',
      definitionHash: 'NOT_APPLICABLE_CATALOG_ONLY',
      evidence: manifest.evidence.map(record => ({ ...record })),
      referenceApplicability: manifest.referenceApplicability.map(record => ({ ...record })),
      gate: {
        publishable: false,
        errors: [...new Set(reasons)],
        warnings: [],
        reportEligibility: { maxEligibleLevel: null, pilotWordingRequired: false, requiredReferenceWording: [], forbiddenClaims: ['全国常模', '诊断结论'] },
      },
    }
  }
  return entry
}

export const buildUnifiedScaleLibraryReadModel = (context: ScaleLibraryReadModelContext = {}): UnifiedScaleLibraryReadModel => {
  const base = buildScaleLibraryReadModel(context)
  const candidates = listScaleInstrumentSources().filter(source => !source.executable).map(source => buildCandidate(source, context, base.generatedAt))
  return {
    ...base,
    entries: [...base.entries, ...candidates],
    diagnostics: [...base.diagnostics, ...candidates.map(entry => ({
      severity: 'warning' as const,
      code: 'CATALOG_ONLY_EXECUTABLE_PENDING',
      message: `${entry.identity.instrumentKey}:${entry.identity.instrumentVersion} is catalog-only and cannot start.`,
    }))],
  }
}
export const filterUnifiedScaleLibraryEntries = (entries: readonly UnifiedScaleLibraryEntry[], filters: ScaleLibraryFilterInput = {}): UnifiedScaleLibraryEntry[] =>
  filterScaleLibraryEntries(entries as readonly ScaleLibraryEntry[], filters) as UnifiedScaleLibraryEntry[]
export const getUnifiedScaleLibraryEntry = (model: UnifiedScaleLibraryReadModel, instrumentKey: string, instrumentVersion: string): UnifiedScaleLibraryEntry | undefined =>
  getScaleLibraryEntry({ ...model, entries: model.entries as ScaleLibraryEntry[] }, instrumentKey, instrumentVersion) as UnifiedScaleLibraryEntry | undefined
