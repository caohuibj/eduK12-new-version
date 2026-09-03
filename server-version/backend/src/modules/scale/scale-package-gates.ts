/**
 * Scale package publication gates for WHO-5 / SDQ / TEXI.
 * Uses the same durable rights evaluator as Prep 9.1 (resolveEffectiveAuthorization
 * + electronic/scoring/translation/display) — no weaker copies.
 */
import {
  assertLocaleTerritoryMatch,
  evaluateAuthorizationOverlayStatus,
  resolveEffectiveAuthorization,
  type InstrumentAuthorizationRecordV1,
} from '../assessment-authorization'
import { assertContentLocaleCompatible } from './content-locale'
import { getBlockedScalePackage } from './packages/blocked-observer-packages'
import { SDQ_TEACHER_ZH_CN_TRANSLATION_PENDING } from './packages/sdq-teacher-en-t4-10-v1'
import { isTexiLocalizationManifestSigned } from './localization/texi-localization-manifest'
import { getScalePackage, validateScalePackage } from './scale-package.registry'

export interface ScalePackageGateResultV1 {
  instrumentKey: string
  instrumentVersion: string
  publishable: boolean
  blocked: boolean
  errors: string[]
  warnings: string[]
}

const ELIGIBLE = new Set(['APPROVED', 'EVIDENCE_PENDING'])

/**
 * Shared durable rights check — same semantics as evaluateBundlePublication rights gate.
 */
export const evaluateDurableInstrumentRights = (input: {
  instrumentKey: string
  instrumentVersion: string
  authorizations: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  nowIso?: string
  requireElectronicAdministration?: boolean
  requireScoring?: boolean
  requireTranslation?: boolean
  requireDisplay?: boolean
}): { ok: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = []
  const warnings: string[] = []
  const nowIso = input.nowIso ?? new Date().toISOString()
  const requireElectronic = input.requireElectronicAdministration !== false
  const requireScoring = input.requireScoring !== false
  const requireTranslation = input.requireTranslation === true
  const requireDisplay = input.requireDisplay !== false

  const effective = resolveEffectiveAuthorization({
    authorizations: input.authorizations,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    nowIso,
  })
  if (!effective || !ELIGIBLE.has(effective.status)) {
    errors.push(
      `${input.instrumentKey}@${input.instrumentVersion} requires APPROVED|EVIDENCE_PENDING authorization`,
    )
    return { ok: false, errors, warnings }
  }
  const overlay = evaluateAuthorizationOverlayStatus(effective, nowIso)
  if (overlay === 'EXPIRED' || overlay === 'REVOKED' || overlay === 'DRAFT') {
    errors.push(`${input.instrumentKey}@${input.instrumentVersion} authorization ${overlay}`)
  }
  if (Date.parse(nowIso) < Date.parse(effective.validFrom) || Date.parse(nowIso) > Date.parse(effective.validTo)) {
    errors.push(`${input.instrumentKey}@${input.instrumentVersion} outside validFrom/validTo`)
  }
  const scope = assertLocaleTerritoryMatch({
    record: effective,
    locale: input.locale,
    territory: input.territory,
  })
  if (!scope.ok) errors.push(scope.message ?? 'SCOPE_MISMATCH')
  if (requireElectronic && !effective.scope.electronicAdministration) {
    errors.push(`${input.instrumentKey}: electronicAdministration required`)
  }
  if (requireScoring && !effective.scope.scoring) {
    errors.push(`${input.instrumentKey}: scoring required`)
  }
  if (requireTranslation && !effective.scope.translation) {
    errors.push(`${input.instrumentKey}: translation required`)
  }
  if (requireDisplay && !effective.scope.display) {
    errors.push(`${input.instrumentKey}: display required`)
  }
  if (effective.status === 'EVIDENCE_PENDING') {
    warnings.push(`${input.instrumentKey}: EVIDENCE_PENDING — warn only`)
  }
  return { ok: errors.length === 0, errors, warnings }
}

export const evaluateWho5ScalePackageGate = (input: {
  authorizations: InstrumentAuthorizationRecordV1[]
  deploymentCommercialNature: 'NON_COMMERCIAL' | 'COMMERCIAL' | 'UNSPECIFIED'
  locale: string
  territory: string
  nowIso?: string
}): ScalePackageGateResultV1 => {
  const instrumentKey = 'who5'
  const instrumentVersion = '1.0.0'
  const errors: string[] = []
  const warnings: string[] = []
  const pkg = getScalePackage(instrumentKey, instrumentVersion)
  if (!pkg) {
    return {
      instrumentKey,
      instrumentVersion,
      publishable: false,
      blocked: true,
      errors: ['WHO-5 package missing'],
      warnings,
    }
  }
  const validation = validateScalePackage(pkg)
  if (!validation.valid) {
    errors.push(...validation.issues.filter((i) => i.severity === 'error').map((i) => i.message))
  }
  if (input.deploymentCommercialNature !== 'NON_COMMERCIAL') {
    errors.push('WHO-5 仅 NON_COMMERCIAL 可发布')
  }
  const localeGate = assertContentLocaleCompatible({
    instrumentKey,
    requestedLocale: input.locale,
  })
  errors.push(...localeGate.errors)
  const rights = evaluateDurableInstrumentRights({
    instrumentKey,
    instrumentVersion,
    authorizations: input.authorizations,
    locale: input.locale,
    territory: input.territory,
    nowIso: input.nowIso,
    requireElectronicAdministration: true,
    requireScoring: true,
    requireDisplay: true,
    requireTranslation: false,
  })
  errors.push(...rights.errors)
  warnings.push(...rights.warnings)
  const effective = resolveEffectiveAuthorization({
    authorizations: input.authorizations,
    instrumentKey,
    instrumentVersion,
    nowIso: input.nowIso ?? new Date().toISOString(),
  })
  if (effective && effective.scope.commercialNature !== 'NON_COMMERCIAL') {
    errors.push('WHO-5 authorization commercialNature must be NON_COMMERCIAL')
  }
  return {
    instrumentKey,
    instrumentVersion,
    publishable: errors.length === 0,
    blocked: false,
    errors,
    warnings,
  }
}

/**
 * SDQ electronic administration/scoring must bind approved authorization.
 * Parent zh-Hans content is landed; teacher zh-CN still pending signed translation
 * (English T4-10 source is locked in-package; product key sdq_teacher_zh_cn retained).
 */
export const evaluateSdqElectronicAdminGate = (input: {
  instrumentKey: string
  instrumentVersion: string
  authorizations: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  nowIso?: string
  /** When true, allow teacher package to publish English source under en locale only. */
  allowEnglishTeacherSource?: boolean
}): ScalePackageGateResultV1 => {
  const gate = getBlockedScalePackage(input.instrumentKey, input.instrumentVersion)
  const errors: string[] = []
  const warnings: string[] = []
  const pkg = getScalePackage(input.instrumentKey, input.instrumentVersion)
  if (!pkg) {
    errors.push(`SDQ package not registered: ${input.instrumentKey}@${input.instrumentVersion}`)
  } else {
    const validation = validateScalePackage(pkg)
    if (!validation.valid) {
      errors.push(...validation.issues.filter((i) => i.severity === 'error').map((i) => i.message))
    }
  }

  const localeGate = assertContentLocaleCompatible({
    instrumentKey: input.instrumentKey,
    requestedLocale: input.locale,
    allowEnglishSourceForZhCnKey: input.allowEnglishTeacherSource === true && input.locale === 'en',
  })
  errors.push(...localeGate.errors)

  if (
    input.instrumentKey === 'sdq_teacher_zh_cn'
    && input.locale === 'zh-CN'
    && !input.allowEnglishTeacherSource
  ) {
    errors.push(`SDQ teacher zh-CN translation pending: ${SDQ_TEACHER_ZH_CN_TRANSLATION_PENDING.status}`)
    errors.push(...SDQ_TEACHER_ZH_CN_TRANSLATION_PENDING.notes)
  }

  const rights = evaluateDurableInstrumentRights({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    authorizations: input.authorizations,
    locale: input.locale,
    territory: input.territory,
    nowIso: input.nowIso,
    requireElectronicAdministration: true,
    requireScoring: true,
    requireDisplay: true,
    requireTranslation: input.locale === 'zh-CN' && input.instrumentKey === 'sdq_teacher_zh_cn',
  })
  errors.push(...rights.errors)
  warnings.push(...rights.warnings)

  const blockedForLocale = (
    input.instrumentKey === 'sdq_teacher_zh_cn' && input.locale === 'zh-CN'
  )

  return {
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    publishable: errors.length === 0,
    blocked: blockedForLocale || Boolean(gate && errors.length > 0 && !pkg),
    errors,
    warnings,
  }
}

/**
 * TEXI localization still needs signed manifest + durable rights
 * (electronic/scoring/translation/display as required).
 */
export const evaluateTexiLocalizationGate = (input: {
  instrumentKey: string
  instrumentVersion: string
  localizationManifest: unknown
  authorizations?: InstrumentAuthorizationRecordV1[]
  locale?: string
  territory?: string
  nowIso?: string
}): ScalePackageGateResultV1 => {
  const gate = getBlockedScalePackage(input.instrumentKey, input.instrumentVersion)
  const errors: string[] = []
  const warnings: string[] = ['TEXI descriptive only; no mainland norms claims']
  const pkg = getScalePackage(input.instrumentKey, input.instrumentVersion)
  if (!pkg) {
    errors.push(`TEXI package not registered: ${input.instrumentKey}@${input.instrumentVersion}`)
  } else {
    const validation = validateScalePackage(pkg)
    if (!validation.valid) {
      errors.push(...validation.issues.filter((i) => i.severity === 'error').map((i) => i.message))
    }
  }
  if (!isTexiLocalizationManifestSigned(input.localizationManifest)) {
    errors.push('TEXI localization manifest missing or unsigned')
    if (gate) errors.push(`package gate: ${gate.reasons.join(',')}`)
  }
  const locale = input.locale ?? 'zh-CN'
  const localeGate = assertContentLocaleCompatible({
    instrumentKey: input.instrumentKey,
    requestedLocale: locale,
  })
  errors.push(...localeGate.errors)

  if (input.authorizations) {
    const rights = evaluateDurableInstrumentRights({
      instrumentKey: input.instrumentKey,
      instrumentVersion: input.instrumentVersion,
      authorizations: input.authorizations,
      locale,
      territory: input.territory ?? 'CN',
      nowIso: input.nowIso,
      requireElectronicAdministration: true,
      requireScoring: true,
      requireTranslation: true,
      requireDisplay: true,
    })
    errors.push(...rights.errors)
    warnings.push(...rights.warnings)
  } else {
    // Caller may probe unsigned-manifest fail-closed before rights are attached.
    warnings.push('TEXI durable authorization records not supplied to localization gate')
  }

  return {
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    publishable: errors.length === 0,
    blocked: !isTexiLocalizationManifestSigned(input.localizationManifest),
    errors,
    warnings,
  }
}
