/**
 * Pilot-first Publication Gate（SL2-C6）——组合既有事实源的通用出版门。
 *
 * 职责分层（§25）：
 *   Rights hard gate                ← evaluateDurableInstrumentRights（复用）
 *   Localization hard gate          ← LocalizationManifestV1 + content locale（复用）
 *   Product correctness hard gate   ← validateScalePackage（复用）
 *   Scientific completeness         ← soft layer，永不阻塞（pilot-publication-policy）
 *
 * 不重写 WHO-5 / SDQ / TEXI 既有 gate（§27）：它们的 instrument-specific 约束
 * （如 WHO-5 non-commercial）继续由原 gate 承担；本模块面向新 instrument 的
 * 通用发布流程，只组合共享原语。
 *
 * fail-closed 项：package 校验失败、authorization 缺失/过期/拒绝、content locale
 * 不匹配、本地化 provenance 缺失/不可用（DENIED/PENDING/UNKNOWN rights 或
 * reviewStatus=PENDING）、requested respondent 不在 catalog 声明范围内。
 */
import { validateScalePackage, type ScalePackageV2 } from '../scale-package.registry'
import { assertContentLocaleCompatible } from '../content-locale'
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
  /** catalog manifest 以 unknown 传入、gate 内部解析——无效 manifest fail-closed。 */
  manifest: unknown
  /** 通用 LocalizationManifestV1（§12.C：发布必须携带本地化 provenance）。 */
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
  localizationUsable: boolean
}

export const evaluatePilotFirstPublicationGate = (input: PilotFirstPublicationGateInput): PilotFirstPublicationGateResult => {
  const errors: string[] = []
  const warnings: string[] = []

  // 1) Product correctness hard gate（复用 package 级校验，含 golden cases）
  const packageValidation = validateScalePackage(input.pkg)
  const packageErrors = packageValidation.issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.path}: ${issue.message}`)

  // 2) Catalog manifest 解析（fail-closed）
  const manifestParse = parseScaleCatalogManifest(input.manifest)
  if (!manifestParse.ok) {
    errors.push(manifestParse.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '))
  }

  // 3) Localization hard gate（通用 manifest；原专用 gate 不受影响）
  let localizationUsable = false
  const localizationErrors: string[] = []
  let localization: { sourceLocale: string; targetLocale: string } | null = null
  if (input.localizationManifest === undefined) {
    localizationErrors.push('localization provenance missing：发布必须携带 LocalizationManifestV1')
  } else {
    const parsed = parseLocalizationManifest(input.localizationManifest)
    if (!parsed.ok) {
      localizationErrors.push(`localization manifest invalid: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
    } else {
      localization = { sourceLocale: parsed.manifest.sourceLocale, targetLocale: parsed.manifest.targetLocale }
      if (parsed.manifest.translationRightsStatus !== 'COVERED_BY_INSTRUMENT_AUTHORIZATION') {
        localizationErrors.push(`translation rights ${parsed.manifest.translationRightsStatus}：非 COVERED 状态不得发布`)
      }
      if (parsed.manifest.reviewStatus !== 'APPROVED') {
        localizationErrors.push('localization manifest reviewStatus=PENDING：治理审核未完成，不得发布')
      }
      localizationUsable = localizationErrors.length === 0
      if (parsed.manifest.expertReviewStatus !== 'COMPLETED') {
        warnings.push(`localization expertReviewStatus=${parsed.manifest.expertReviewStatus}：PILOT 允许，作为 research gap 记录`)
      }
      if (parsed.manifest.cognitiveDebriefStatus !== 'COMPLETED') {
        warnings.push(`localization cognitiveDebriefStatus=${parsed.manifest.cognitiveDebriefStatus}：PILOT 允许，作为 research gap 记录`)
      }
    }
  }

  // 4) Rights hard gate（复用 durable rights evaluator；原文部署不要求 translation 权利）
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
  // EVIDENCE_PENDING 等 rights 级 warn-only 语义必须透传到上层（不丢失、不阻塞）
  warnings.push(...rights.warnings)

  // 5) Content locale（复用既有 contentLocale 纪律）
  const localeGate = assertContentLocaleCompatible({
    instrumentKey: input.pkg.key,
    requestedLocale: input.locale,
  })

  // 6) Respondent applicability（catalog 声明范围）
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

  const decision: PilotPublicationDecision = manifest && scientific
    ? evaluatePilotPublicationPolicy({
        executableCorrectness: { ok: packageErrors.length === 0, errors: packageErrors },
        rights: { ok: rights.ok, errors: [...localeGate.errors, ...rights.errors] },
        localization: { ok: localizationErrors.length === 0, errors: localizationErrors },
        respondentMatch: { ok: respondentMatchErrors.length === 0, errors: respondentMatchErrors },
        scientific,
      })
    : {
        // catalog manifest 无效时的兜底路径：保持各层前缀清晰，直接 fail-closed
        publishable: false,
        errors: [
          ...packageErrors.map((error) => `[executableCorrectness] ${error}`),
          ...errors.map((error) => `[catalogManifest] ${error}`),
          ...localizationErrors.map((error) => `[localization] ${error}`),
          ...localeGate.errors.map((error) => `[rights] ${error}`),
          ...rights.errors.map((error) => `[rights] ${error}`),
          ...respondentMatchErrors.map((error) => `[respondentMatch] ${error}`),
        ],
        warnings,
        limitations: [],
        researchGaps: [],
      }
  // gate 级 warning（PILOT 本地化研究项）并入 decision
  decision.warnings.push(...warnings)

  const reportEligibility = manifest
    ? evaluateReportEligibility({
        definition: input.pkg.definition,
        references: input.pkg.references,
        instrumentKey: input.pkg.key,
        instrumentVersion: input.pkg.instrumentVersion,
        scoringVersion: input.pkg.definition.scoring.scoringVersion,
        deployment: { territory: input.territory, respondent: input.requestedRespondent },
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
