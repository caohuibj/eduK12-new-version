import { listScaleInstrumentSources, getScaleInstrumentLocalization } from '../onboarding/instrument-registry'
import { materializeCatalogManifest } from '../onboarding/validate-instrument'
import {
  evaluateAuthorizationOverlayStatus,
  resolveEffectiveAuthorization,
  type InstrumentAuthorizationRecordV1,
} from '../../assessment-authorization'
import { hashScaleDefinition } from '../scale-definition'
import {
  getScalePackage,
  listScalePackages,
  type ScalePackageV2,
} from '../scale-package.registry'
import {
  createScaleCatalogRegistry,
  type ScaleCatalogEntry,
  type ScaleCatalogRegistry,
} from './catalog-registry'
import {
  type ConstructDomain,
  type ForbiddenUse,
  type IntendedUse,
  type RespondentType,
  type ScaleCatalogManifestV1,
  type ScaleEvidenceRecord,
  type ScaleReferenceApplicabilityRecord,
} from './catalog-manifest'
import {
  evaluatePilotFirstPublicationGate,
  type PilotFirstPublicationGateResult,
} from './pilot-publication-gate'
import {
  REPORT_LEVELS,
  type ReportEligibilityDecision,
  type ReportLevel,
} from './report-eligibility'
import { parseLocalizationManifest, type LocalizationManifestV1 } from './localization-manifest'

export type ScaleLibraryAvailabilityStatus = 'AVAILABLE' | 'RESTRICTED' | 'NOT_AVAILABLE'
export type ScaleLibraryViewerRole = 'STUDENT' | 'TEACHER' | 'ADMIN'

export interface ScaleLibraryDeploymentRecord {
  scaleId: string
  code: string
  instrumentVersion: string
  status: string
  visibility?: string
}

export interface ScaleLibraryReadModelContext {
  locale?: string
  territory?: string
  respondent?: RespondentType
  authorizations?: readonly InstrumentAuthorizationRecordV1[]
  deployments?: readonly ScaleLibraryDeploymentRecord[]
  viewerRole?: ScaleLibraryViewerRole
  nowIso?: string
}

export interface ScaleLibraryFilterInput {
  keyword?: string
  instrumentFamily?: string
  primaryDomain?: ConstructDomain
  secondaryDomain?: ConstructDomain
  respondent?: RespondentType
  minAge?: number
  maxAge?: number
  minGrade?: number
  maxGrade?: number
  locale?: string
  intendedUse?: IntendedUse
  availability?: ScaleLibraryAvailabilityStatus
}

export interface ScaleLibraryAvailability {
  status: ScaleLibraryAvailabilityStatus
  locale: string
  territory: string
  respondent: RespondentType
  reasons: string[]
  launch?: {
    scaleId: string
    route: string
  }
}

export interface ScaleLibraryLocalizationSummary {
  sourceLocale: string
  targetLocale: string
  localizationVersion: string
  adaptationMethod: LocalizationManifestV1['adaptationMethod']
  reviewStatus: LocalizationManifestV1['reviewStatus']
  expertReviewStatus: LocalizationManifestV1['expertReviewStatus']
  cognitiveDebriefStatus: LocalizationManifestV1['cognitiveDebriefStatus']
}

export interface ScaleLibraryRightsSummary {
  status: 'APPROVED' | 'EVIDENCE_PENDING' | 'NOT_GRANTED' | 'SCOPE_MISMATCH' | 'INELIGIBLE'
  commercialNature: InstrumentAuthorizationRecordV1['scope']['commercialNature']
  locales: string[]
  territories: string[]
  validTo?: string
}

export interface ScaleLibraryReportSummary {
  maxEligibleLevel: ReportLevel | null
  levels: Record<ReportLevel, { eligible: boolean }>
  scoreCount: number
  dimensionLabels: string[]
  limitations: string[]
  disclaimer: string
}

export interface ScaleLibraryReferenceSummary {
  policy: 'none' | 'declared'
  packageReferenceCount: number
  applicabilityCount: number
  referenceVersions: string[]
  displayText: string
}

export interface ScaleLibraryEvidenceSummary {
  recordCount: number
  status: 'EVIDENCE_RECORDED' | 'NO_EVIDENCE_RECORDED'
  coverageText: string
}

export interface ScaleLibraryGovernanceDetail {
  catalogManifestVersion: number
  catalogStatus: ScaleCatalogManifestV1['catalogStatus']
  scientificMaturity: ScaleCatalogManifestV1['scientificMaturity']
  bindingStatus: ScaleCatalogEntry['bindingStatus']
  packageReleaseStatus: ScalePackageV2['releaseStatus']
  definitionHash: string
  evidence: ScaleEvidenceRecord[]
  referenceApplicability: ScaleReferenceApplicabilityRecord[]
  gate: {
    publishable: boolean
    errors: string[]
    warnings: string[]
    reportEligibility: ReportEligibilityDecision
  }
  authorization?: {
    authorizationId: string
    status: InstrumentAuthorizationRecordV1['status']
    basis: string
  }
}

export interface ScaleLibraryEntry {
  identity: ScaleCatalogManifestV1['identity']
  source: {
    title?: string
    citation?: string
    url?: string
    publicationYear?: number
  }
  construct: ScaleCatalogManifestV1['construct']
  applicability: ScaleCatalogManifestV1['population']
  administration: ScaleCatalogManifestV1['administration']
  intendedUse: {
    intendedUses: Array<{ use: IntendedUse; evidenceStatus: ScaleCatalogManifestV1['intendedUse']['intendedUses'][number]['evidenceStatus']; notes?: string }>
    forbiddenUses: ForbiddenUse[]
  }
  localization: ScaleLibraryLocalizationSummary
  rights: ScaleLibraryRightsSummary
  evidence: ScaleLibraryEvidenceSummary
  references: ScaleLibraryReferenceSummary
  report: ScaleLibraryReportSummary
  availability: ScaleLibraryAvailability
  governance?: ScaleLibraryGovernanceDetail
}

export interface ScaleLibraryReadModel {
  schemaVersion: 1
  generatedAt: string
  entries: ScaleLibraryEntry[]
  diagnostics: Array<{ severity: 'error' | 'warning'; code: string; message: string }>
}

const DEFAULT_TERRITORY = 'CN'

const bindingKey = (instrumentKey: string, instrumentVersion: string): string => `${instrumentKey}:${instrumentVersion}`

const unique = (values: string[]): string[] => [...new Set(values)]

const normalizeText = (value: string): string => value.trim().toLocaleLowerCase()

const deploymentForKey = (
  deployments: readonly ScaleLibraryDeploymentRecord[],
  pkg: ScalePackageV2,
): ScaleLibraryDeploymentRecord | undefined => deployments.find((deployment) => (
  deployment.code === pkg.key && deployment.instrumentVersion === pkg.instrumentVersion
))

const summarizeRights = (input: {
  pkg: ScalePackageV2
  authorizations: readonly InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  nowIso: string
}): ScaleLibraryRightsSummary => {
  const effective = resolveEffectiveAuthorization({
    authorizations: [...input.authorizations],
    instrumentKey: input.pkg.key,
    instrumentVersion: input.pkg.instrumentVersion,
    nowIso: input.nowIso,
  })
  if (!effective) {
    return { status: 'NOT_GRANTED', commercialNature: 'UNSPECIFIED', locales: [], territories: [] }
  }
  const overlay = evaluateAuthorizationOverlayStatus(effective, input.nowIso)
  const scopeMatches = effective.scope.locales.includes(input.locale) && effective.scope.territories.includes(input.territory)
  const eligibleStatus = effective.status === 'APPROVED' || effective.status === 'EVIDENCE_PENDING'
  const status: ScaleLibraryRightsSummary['status'] = !eligibleStatus || overlay === 'EXPIRED' || overlay === 'REVOKED' || overlay === 'DRAFT'
    ? 'INELIGIBLE'
    : (scopeMatches
      ? (effective.status === 'APPROVED' ? 'APPROVED' : 'EVIDENCE_PENDING')
      : 'SCOPE_MISMATCH')
  return {
    status,
    commercialNature: effective.scope.commercialNature,
    locales: [...effective.scope.locales],
    territories: [...effective.scope.territories],
    validTo: effective.validTo,
  }
}

const summarizeGateReason = (input: {
  pkg: ScalePackageV2
  manifest: ScaleCatalogManifestV1
  localization: LocalizationManifestV1
  deployment?: ScaleLibraryDeploymentRecord
  locale: string
  respondent: RespondentType
  gate: PilotFirstPublicationGateResult
}): { status: ScaleLibraryAvailabilityStatus; reasons: string[] } => {
  const reasons: string[] = []
  const targetLocaleMatches = input.localization.targetLocale === input.locale
  const respondentMatches = input.manifest.population.respondentTypes.includes(input.respondent)
  const deploymentPublished = input.deployment?.status === 'PUBLISHED'

  if (input.pkg.releaseStatus === 'RETIRED') reasons.push('量表包已退役。')
  if (input.manifest.catalogStatus !== 'ACCEPTED') reasons.push('目录记录尚未完成治理审核。')
  if (!targetLocaleMatches) reasons.push(`当前内容语言为 ${input.localization.targetLocale}，不提供 ${input.locale} 版本。`)
  if (!respondentMatches) reasons.push('当前作答者类型不在该量表的适用范围内。')
  if (!input.deployment) reasons.push('当前环境尚无已发布的可启动量表部署。')
  else if (!deploymentPublished) reasons.push('当前量表部署尚未发布。')
  if (input.pkg.releaseStatus !== 'PUBLISHED') reasons.push('量表包尚未发布，当前仅可浏览目录信息。')
  const operationalErrors = input.gate.decision.warnings.filter(warning => /rights\/governance|localization\/deployment/.test(warning))
  if (input.gate.decision.errors.length > 0 || operationalErrors.length > 0) {
    const allErrors = [...input.gate.decision.errors, ...operationalErrors]
    const rightsFailure = allErrors.some((error) => /authorization|rights|commercialNature|electronicAdministration|scoring required|translation required|display required|locale\/territory/i.test(error))
    const localizationFailure = allErrors.some((error) => /localization|contentLocale|targetLocale|translation pending/i.test(error))
    if (rightsFailure) reasons.push('当前 locale/territory 的电子施测、计分或显示授权未满足。')
    if (localizationFailure && targetLocaleMatches) reasons.push('当前语言的本地化治理条件尚未满足。')
    if (!rightsFailure && !localizationFailure) reasons.push('当前发布门未通过，暂不可启动。')
  }

  const dedupedReasons = unique(reasons)
  if (input.pkg.releaseStatus === 'RETIRED' || !input.deployment || !respondentMatches) {
    return { status: 'NOT_AVAILABLE', reasons: dedupedReasons }
  }
  if (dedupedReasons.length > 0) return { status: 'RESTRICTED', reasons: dedupedReasons }
  return { status: 'AVAILABLE', reasons: [] }
}

const buildReportSummary = (pkg: ScalePackageV2, eligibility: ReportEligibilityDecision): ScaleLibraryReportSummary => ({
  maxEligibleLevel: eligibility.maxEligibleLevel,
  levels: REPORT_LEVELS.reduce((result, level) => {
    result[level] = { eligible: eligibility.levels[level].eligible }
    return result
  }, {} as Record<ReportLevel, { eligible: boolean }>),
  scoreCount: pkg.definition.scoring.scores.length,
  dimensionLabels: pkg.definition.scoring.scores.map((score) => score.label),
  limitations: [...pkg.definition.report.limitations],
  disclaimer: pkg.definition.report.disclaimer,
})

const buildReferenceSummary = (pkg: ScalePackageV2, manifest: ScaleCatalogManifestV1): ScaleLibraryReferenceSummary => {
  const policy = pkg.definition.referencePolicy.type
  const versions = pkg.references.map((reference) => reference.referenceVersion)
  return {
    policy,
    packageReferenceCount: pkg.references.length,
    applicabilityCount: manifest.referenceApplicability.length,
    referenceVersions: unique(versions),
    displayText: policy === 'none'
      ? '当前仅提供描述性分数，不提供群体常模或百分位参考。'
      : '当前可用参考的适用人群、语言与 territory 必须与部署上下文一致。',
  }
}

const buildEvidenceSummary = (manifest: ScaleCatalogManifestV1): ScaleLibraryEvidenceSummary => ({
  recordCount: manifest.evidence.length,
  status: manifest.evidence.length > 0 ? 'EVIDENCE_RECORDED' : 'NO_EVIDENCE_RECORDED',
  coverageText: manifest.evidence.length > 0
    ? ['Scientific Evidence Matrix 已记录科研证据；不作超出样本的验证、常模或诊断声称。', ...manifest.evidence.map(record => [record.population, record.notes].filter(Boolean).join('：'))].join(' ')
    : 'Wave 0 当前未在 Scientific Evidence Matrix 中录入可用于本地验证的科研证据；不作验证、常模或诊断声称。',
})

const buildEntry = (input: {
  catalogEntry: ScaleCatalogEntry
  localization: LocalizationManifestV1
  context: Required<Pick<ScaleLibraryReadModelContext, 'locale' | 'territory' | 'nowIso'>> & Pick<ScaleLibraryReadModelContext, 'respondent' | 'authorizations' | 'deployments' | 'viewerRole'>
}): ScaleLibraryEntry => {
  const { catalogEntry, localization, context } = input
  const pkg = catalogEntry.pkg!
  const manifest = catalogEntry.manifest
  const respondent = context.respondent ?? manifest.population.respondentTypes[0]
  const authorizations = context.authorizations ?? []
  const deployments = context.deployments ?? []
  const deployment = deploymentForKey(deployments, pkg)
  const gate = evaluatePilotFirstPublicationGate({
    pkg,
    manifest,
    localizationManifest: localization,
    authorizations: [...authorizations],
    locale: context.locale,
    territory: context.territory,
    requestedRespondent: respondent,
    nowIso: context.nowIso,
  })
  const availabilitySummary = summarizeGateReason({
    pkg,
    manifest,
    localization,
    deployment,
    locale: context.locale,
    respondent,
    gate,
  })
  const rights = summarizeRights({
    pkg,
    authorizations,
    locale: context.locale,
    territory: context.territory,
    nowIso: context.nowIso,
  })
  const report = buildReportSummary(pkg, gate.reportEligibility)

  const entry: ScaleLibraryEntry = {
    identity: { ...manifest.identity },
    source: { ...pkg.definition.source },
    construct: { ...manifest.construct, secondaryDomains: [...manifest.construct.secondaryDomains], constructOverlapTags: [...manifest.construct.constructOverlapTags] },
    applicability: { ...manifest.population, respondentTypes: [...manifest.population.respondentTypes] },
    administration: { ...manifest.administration, administrationModes: [...manifest.administration.administrationModes], layoutConstraints: [...manifest.administration.layoutConstraints] },
    intendedUse: {
      intendedUses: manifest.intendedUse.intendedUses.map((use) => ({ ...use })),
      forbiddenUses: [...manifest.intendedUse.forbiddenUses],
    },
    localization: {
      sourceLocale: localization.sourceLocale,
      targetLocale: localization.targetLocale,
      localizationVersion: localization.localizationVersion,
      adaptationMethod: localization.adaptationMethod,
      reviewStatus: localization.reviewStatus,
      expertReviewStatus: localization.expertReviewStatus,
      cognitiveDebriefStatus: localization.cognitiveDebriefStatus,
    },
    rights,
    evidence: buildEvidenceSummary(manifest),
    references: buildReferenceSummary(pkg, manifest),
    report,
    availability: {
      ...availabilitySummary,
      locale: context.locale,
      territory: context.territory,
      respondent,
      ...(availabilitySummary.status === 'AVAILABLE' && deployment
        ? { launch: { scaleId: deployment.scaleId, route: `/student/scales/${deployment.scaleId}` } }
        : {}),
    },
  }

  if (context.viewerRole === 'ADMIN') {
    const effective = resolveEffectiveAuthorization({
      authorizations: [...authorizations],
      instrumentKey: pkg.key,
      instrumentVersion: pkg.instrumentVersion,
      nowIso: context.nowIso,
    })
    entry.governance = {
      catalogManifestVersion: manifest.catalogManifestVersion,
      catalogStatus: manifest.catalogStatus,
      scientificMaturity: manifest.scientificMaturity,
      bindingStatus: catalogEntry.bindingStatus,
      packageReleaseStatus: pkg.releaseStatus,
      definitionHash: hashScaleDefinition(pkg.definition),
      evidence: manifest.evidence.map((record) => ({ ...record })),
      referenceApplicability: manifest.referenceApplicability.map((record) => ({ ...record })),
      gate: {
        publishable: gate.decision.publishable && pkg.releaseStatus === 'PUBLISHED' && deployment?.status === 'PUBLISHED',
        errors: unique([...gate.decision.errors]),
        warnings: unique([...gate.decision.warnings]),
        reportEligibility: gate.reportEligibility,
      },
      ...(effective
        ? { authorization: { authorizationId: effective.authorizationId, status: effective.status, basis: effective.basis } }
        : {}),
    }
  }

  return entry
}

export const buildScaleLibraryReadModel = (context: ScaleLibraryReadModelContext = {}): ScaleLibraryReadModel => {
  const territory = context.territory ?? DEFAULT_TERRITORY
  const nowIso = context.nowIso ?? new Date().toISOString()
  const entries: ScaleLibraryEntry[] = []
  const registry = createScaleCatalogRegistry(listScaleInstrumentSources().filter(source => source.executable).map(materializeCatalogManifest))
  registry.entries.forEach((catalogEntry) => {
    if (!catalogEntry.pkg) return
    const localization = getScaleInstrumentLocalization(catalogEntry.manifest.identity.instrumentKey, catalogEntry.manifest.identity.instrumentVersion)
    if (!localization) return
    const locale = context.locale ?? localization.targetLocale
    entries.push(buildEntry({
      catalogEntry,
      localization,
      context: { ...context, locale, territory, nowIso },
    }))
  })
  const packageOrder = new Map(listScalePackages().map((pkg, index) => [bindingKey(pkg.key, pkg.instrumentVersion), index]))
  entries.sort((left, right) => (packageOrder.get(bindingKey(left.identity.instrumentKey, left.identity.instrumentVersion)) ?? Infinity) - (packageOrder.get(bindingKey(right.identity.instrumentKey, right.identity.instrumentVersion)) ?? Infinity))
  return {
    schemaVersion: 1,
    generatedAt: nowIso,
    entries,
    diagnostics: registry.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
    })),
  }
}

export const filterScaleLibraryEntries = (
  entries: readonly ScaleLibraryEntry[],
  filters: ScaleLibraryFilterInput = {},
): ScaleLibraryEntry[] => {
  const keyword = filters.keyword ? normalizeText(filters.keyword) : undefined
  return entries.filter((entry) => {
    if (keyword) {
      const haystack = normalizeText([
        entry.identity.canonicalName,
        entry.identity.abbreviation ?? '',
        entry.identity.instrumentFamily ?? '',
        entry.construct.primaryDomain,
        entry.construct.constructDefinition,
        entry.source.title ?? '',
      ].join(' '))
      if (!haystack.includes(keyword)) return false
    }
    if (filters.instrumentFamily && entry.identity.instrumentFamily !== filters.instrumentFamily) return false
    if (filters.primaryDomain && entry.construct.primaryDomain !== filters.primaryDomain) return false
    if (filters.secondaryDomain && !entry.construct.secondaryDomains.includes(filters.secondaryDomain)) return false
    if (filters.respondent && !entry.applicability.respondentTypes.includes(filters.respondent)) return false
    if (filters.locale && entry.localization.targetLocale !== filters.locale) return false
    if (filters.intendedUse && !entry.intendedUse.intendedUses.some((use) => use.use === filters.intendedUse)) return false
    if (filters.availability && entry.availability.status !== filters.availability) return false
    if (filters.minAge !== undefined && entry.applicability.maxAge !== undefined && entry.applicability.maxAge < filters.minAge) return false
    if (filters.maxAge !== undefined && entry.applicability.minAge !== undefined && entry.applicability.minAge > filters.maxAge) return false
    if (filters.minGrade !== undefined && entry.applicability.gradeRange && entry.applicability.gradeRange.maxGrade < filters.minGrade) return false
    if (filters.maxGrade !== undefined && entry.applicability.gradeRange && entry.applicability.gradeRange.minGrade > filters.maxGrade) return false
    return true
  })
}

export const getScaleLibraryEntry = (
  model: ScaleLibraryReadModel,
  instrumentKey: string,
  instrumentVersion: string,
): ScaleLibraryEntry | undefined => model.entries.find((entry) => (
  bindingKey(entry.identity.instrumentKey, entry.identity.instrumentVersion) === bindingKey(instrumentKey, instrumentVersion)
))

export const isScaleLibraryPublicPayloadSafe = (entry: ScaleLibraryEntry): boolean => {
  const serialized = JSON.stringify(entry)
  return !serialized.includes('itemCode')
    && !serialized.includes('responseSet')
    && !serialized.includes('scorerKey')
    && !serialized.includes('reverse')
    && !serialized.includes('options')
}

export const getScaleLibraryPackage = (instrumentKey: string, instrumentVersion: string): ScalePackageV2 | undefined => getScalePackage(instrumentKey, instrumentVersion)

export const getScaleLibraryContentLocale = (instrumentKey: string): string | undefined => (
  listScaleInstrumentSources().find(source => source.identity.instrumentKey === instrumentKey)?.executable?.contentLocale
)

export const getScaleLibraryLocalizationManifest = (instrumentKey: string, instrumentVersion: string): LocalizationManifestV1 | undefined => (
  getScaleInstrumentLocalization(instrumentKey, instrumentVersion)
)

export const parseScaleLibraryLocalizationManifest = (value: unknown): LocalizationManifestV1 | undefined => {
  const parsed = parseLocalizationManifest(value)
  return parsed.ok ? parsed.manifest : undefined
}