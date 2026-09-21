/**
 * Scale governance composition for Pilot-era catalog data.
 *
 * `decision.publishable` now means Product Readiness only: the exact package is
 * executable in the current Huisurvey workflow. Rights, localization,
 * respondent/deployment fit and scientific completeness remain visible as
 * diagnostics, but they do not turn an executable package back into DRAFT.
 *
 * This evaluator is admin/catalog-side only. It performs no DB queries and is
 * never consulted by participant save/FINAL paths.
 */
import { validateScalePackage, type ScalePackageV2 } from '../scale-package.registry'
import { evaluateDurableInstrumentRights } from '../scale-package-gates'
import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization'
import { parseLocalizationManifest } from './localization-manifest'
import {
  evaluatePilotPublicationPolicy,
  evaluateScientificCompleteness,
  type PilotPublicationDecision,
} from './pilot-publication-policy'
import {
  evaluateReportEligibility,
  type ReportEligibilityDecision,
} from './report-eligibility'
import { parseScaleCatalogManifest, type RespondentType } from './catalog-manifest'

export interface PilotFirstPublicationGateInput {
  pkg: ScalePackageV2
  manifest: unknown
  localizationManifest?: unknown
  authorizations: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  requestedRespondent: RespondentType
  nowIso?: string
}

export interface PilotFirstPublicationGateResult {
  instrumentKey: string
  instrumentVersion: string
  decision: PilotPublicationDecision
  reportEligibility: ReportEligibilityDecision
  /** Deployment diagnostic only; not Product Release. */
  localizationUsable: boolean
}

export const evaluatePilotFirstPublicationGate = (input: PilotFirstPublicationGateInput): PilotFirstPublicationGateResult => {
  const gateWarnings: string[] = []

  // 1) The only Product Release hard gate in this composition.
  const packageValidation = validateScalePackage(input.pkg)
  const packageErrors = packageValidation.issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.path}: ${issue.message}`)

  // 2) Catalog is scientific/discovery governance. Invalid metadata degrades
  // admin/report eligibility but does not make an executable package DRAFT.
  const manifestParse = parseScaleCatalogManifest(input.manifest)
  if (!manifestParse.ok) {
    gateWarnings.push(`[catalog/governance] ${manifestParse.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
  }

  // 3) Localization is retained as a deployment diagnostic.
  let localizationUsable = false
  const localizationErrors: string[] = []
  let localization: { sourceLocale: string; targetLocale: string } | null = null
  if (input.localizationManifest === undefined) {
    localizationErrors.push('localization provenance missing：尚无 LocalizationManifestV1')
  } else {
    const parsed = parseLocalizationManifest(input.localizationManifest)
    if (!parsed.ok) {
      localizationErrors.push(`localization manifest invalid: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
    } else {
      localization = { sourceLocale: parsed.manifest.sourceLocale, targetLocale: parsed.manifest.targetLocale }
      if (parsed.manifest.instrumentKey !== input.pkg.key) {
        localizationErrors.push(`localization instrumentKey=${parsed.manifest.instrumentKey} 与 package key=${input.pkg.key} 不一致`)
      }
      if (parsed.manifest.instrumentVersion !== input.pkg.instrumentVersion) {
        localizationErrors.push(`localization instrumentVersion=${parsed.manifest.instrumentVersion} 与 package instrumentVersion=${input.pkg.instrumentVersion} 不一致`)
      }
      if (parsed.manifest.targetLocale !== input.locale) {
        localizationErrors.push(`localization targetLocale=${parsed.manifest.targetLocale} 与部署 locale=${input.locale} 不一致`)
      }
      if (parsed.manifest.reviewStatus !== 'APPROVED') {
        localizationErrors.push('localization manifest reviewStatus=PENDING：治理审核未完成')
      }
      if (parsed.manifest.expertReviewStatus !== 'COMPLETED') {
        gateWarnings.push(`localization expertReviewStatus=${parsed.manifest.expertReviewStatus}：scientific/deployment gap`)
      }
      if (parsed.manifest.cognitiveDebriefStatus !== 'COMPLETED') {
        gateWarnings.push(`localization cognitiveDebriefStatus=${parsed.manifest.cognitiveDebriefStatus}：scientific/deployment gap`)
      }
    }
  }

  // 4) Rights are governance/operational facts. They may motivate a manual
  // operational pause, but do not redefine DRAFT/PUBLISHED.
  const needsTranslation = localization !== null && localization.sourceLocale !== localization.targetLocale
  const rights = evaluateDurableInstrumentRights({
    instrumentKey: input.pkg.key,
    instrumentVersion: input.pkg.instrumentVersion,
    authorizations: input.authorizations,
    locale: input.locale,
    territory: input.territory,
    nowIso: input.nowIso,
    requireElectronicAdministration: true,
    requireScoring: true,
    requireDisplay: true,
    requireTranslation: needsTranslation,
  })
  gateWarnings.push(...rights.warnings)

  // 5) Source validation already guarantees executable contentLocale === localization.targetLocale.
  // Deployment locale fit is therefore fully represented by the localization manifest above.
  localizationUsable = localizationErrors.length === 0

  // 6) Respondent applicability is deployment/claim governance, not whether
  // the package itself can execute.
  const respondentMatchErrors: string[] = manifestParse.ok
    && !manifestParse.manifest.population.respondentTypes.includes(input.requestedRespondent)
    ? [`requested respondent ${input.requestedRespondent} 不在 catalog 声明范围 [${manifestParse.manifest.population.respondentTypes.join(', ')}]`]
    : []

  const manifest = manifestParse.ok ? manifestParse.manifest : null
  const scientific = manifest
    ? evaluateScientificCompleteness({
        manifest,
        references: input.pkg.references,
        deploymentTerritory: input.territory,
      })
    : null

  const decision: PilotPublicationDecision = scientific
    ? evaluatePilotPublicationPolicy({
        executableCorrectness: { ok: packageErrors.length === 0, errors: packageErrors },
        rights: { ok: rights.ok, errors: rights.errors },
        localization: { ok: localizationUsable, errors: localizationErrors },
        respondentMatch: { ok: respondentMatchErrors.length === 0, errors: respondentMatchErrors },
        scientific,
      })
    : {
        publishable: packageErrors.length === 0,
        errors: packageErrors.map((message) => `[executableCorrectness] ${message}`),
        warnings: [
          ...rights.errors.map((message) => `[rights/governance] ${message}`),
          ...localizationErrors.map((message) => `[localization/deployment] ${message}`),
          ...respondentMatchErrors.map((message) => `[respondent/deployment] ${message}`),
        ],
        limitations: ['Catalog manifest 无效：scientific qualification / report eligibility 无法建立，但不改变 package Product Readiness。'],
        researchGaps: [],
      }
  decision.warnings.push(...gateWarnings)

  const reportEligibility = manifest
    ? evaluateReportEligibility({
        definition: input.pkg.definition,
        references: input.pkg.references,
        instrumentKey: input.pkg.key,
        instrumentVersion: input.pkg.instrumentVersion,
        scoringVersion: input.pkg.definition.scoring.scoringVersion,
        deployment: { territory: input.territory, respondent: input.requestedRespondent, locale: input.locale },
        catalogReferenceApplicability: manifest.referenceApplicability,
      })
    : {
        levels: {
          L1_SCORE_ONLY: { level: 'L1_SCORE_ONLY' as const, eligible: false, reasons: ['catalog manifest 无效'] },
          L2_DESCRIPTIVE: { level: 'L2_DESCRIPTIVE' as const, eligible: false, reasons: ['catalog manifest 无效'] },
          L3_REFERENCED_INTERPRETIVE: { level: 'L3_REFERENCED_INTERPRETIVE' as const, eligible: false, reasons: ['catalog manifest 无效'] },
        },
        maxEligibleLevel: null,
        pilotWordingRequired: false,
        requiredReferenceWording: [],
        forbiddenClaims: [],
      }

  return {
    instrumentKey: input.pkg.key,
    instrumentVersion: input.pkg.instrumentVersion,
    decision,
    reportEligibility,
    localizationUsable,
  }
}
