/**
 * Scale package publication gates for WHO-5 / SDQ / TEXI.
 * Uses durable authorization from Prep 9.1 — never invents item text.
 */
import {
  evaluateAuthorizationOverlayStatus,
  resolveEffectiveAuthorization,
  type InstrumentAuthorizationRecordV1,
} from '../assessment-authorization'
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
  const nowIso = input.nowIso ?? new Date().toISOString()
  const effective = resolveEffectiveAuthorization({
    authorizations: input.authorizations,
    instrumentKey,
    instrumentVersion,
    nowIso,
  })
  if (!effective || (effective.status !== 'APPROVED' && effective.status !== 'EVIDENCE_PENDING')) {
    errors.push('WHO-5 requires APPROVED|EVIDENCE_PENDING authorization')
  } else {
    const overlay = evaluateAuthorizationOverlayStatus(effective, nowIso)
    if (overlay === 'EXPIRED' || overlay === 'REVOKED' || overlay === 'DRAFT') {
      errors.push(`WHO-5 authorization ${overlay}`)
    }
    if (effective.scope.commercialNature !== 'NON_COMMERCIAL') {
      errors.push('WHO-5 authorization commercialNature must be NON_COMMERCIAL')
    }
    if (!effective.scope.locales.includes(input.locale) || !effective.scope.territories.includes(input.territory)) {
      errors.push('WHO-5 locale/territory mismatch')
    }
    if (effective.status === 'EVIDENCE_PENDING') {
      warnings.push('WHO-5 EVIDENCE_PENDING — warn only')
    }
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
 * (English T4-10 source is locked in-package).
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

  if (
    input.instrumentKey === 'sdq_teacher_zh_cn'
    && input.locale === 'zh-CN'
    && !input.allowEnglishTeacherSource
  ) {
    errors.push(`SDQ teacher zh-CN translation pending: ${SDQ_TEACHER_ZH_CN_TRANSLATION_PENDING.status}`)
    errors.push(...SDQ_TEACHER_ZH_CN_TRANSLATION_PENDING.notes)
  }

  const nowIso = input.nowIso ?? new Date().toISOString()
  const effective = resolveEffectiveAuthorization({
    authorizations: input.authorizations,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    nowIso,
  })
  if (!effective || (effective.status !== 'APPROVED' && effective.status !== 'EVIDENCE_PENDING')) {
    errors.push('SDQ electronic admin/scoring requires APPROVED|EVIDENCE_PENDING authorization')
  } else {
    if (!effective.scope.electronicAdministration) errors.push('SDQ requires electronicAdministration=true')
    if (!effective.scope.scoring) errors.push('SDQ requires scoring=true')
    if (!effective.scope.locales.includes(input.locale) || !effective.scope.territories.includes(input.territory)) {
      errors.push('SDQ locale/territory mismatch')
    }
    const overlay = evaluateAuthorizationOverlayStatus(effective, nowIso)
    if (overlay === 'EXPIRED' || overlay === 'REVOKED' || overlay === 'DRAFT') {
      errors.push(`SDQ authorization ${overlay}`)
    }
    if (effective.status === 'EVIDENCE_PENDING') {
      warnings.push('SDQ EVIDENCE_PENDING — warn only')
    }
  }

  if (gate?.reasons.includes('ZH_CN_TRANSLATION_PENDING_SIGNED_MANIFEST') && input.locale === 'zh-CN') {
    // already added above; keep blocked flag true for zh-CN teacher
  }

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

export const evaluateTexiLocalizationGate = (input: {
  instrumentKey: string
  instrumentVersion: string
  localizationManifest: unknown
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
  return {
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    publishable: errors.length === 0,
    blocked: !isTexiLocalizationManifestSigned(input.localizationManifest),
    errors,
    warnings,
  }
}
