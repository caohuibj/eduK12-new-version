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

/** SDQ electronic administration/scoring must bind approved authorization. */
export const evaluateSdqElectronicAdminGate = (input: {
  instrumentKey: string
  instrumentVersion: string
  authorizations: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  nowIso?: string
}): ScalePackageGateResultV1 => {
  const blocked = getBlockedScalePackage(input.instrumentKey, input.instrumentVersion)
  const errors: string[] = []
  const warnings: string[] = []
  if (blocked) {
    errors.push(`package BLOCKED: ${blocked.reasons.join(',')}`)
    errors.push(...blocked.notes)
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
  }
  return {
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    publishable: false,
    blocked: Boolean(blocked),
    errors,
    warnings,
  }
}

export const evaluateTexiLocalizationGate = (input: {
  instrumentKey: string
  instrumentVersion: string
  localizationManifest: unknown
}): ScalePackageGateResultV1 => {
  const blocked = getBlockedScalePackage(input.instrumentKey, input.instrumentVersion)
  const errors: string[] = []
  if (blocked) {
    errors.push(`package BLOCKED: ${blocked.reasons.join(',')}`)
  }
  if (!isTexiLocalizationManifestSigned(input.localizationManifest)) {
    errors.push('TEXI localization manifest missing or unsigned')
  }
  return {
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    publishable: false,
    blocked: true,
    errors,
    warnings: ['TEXI descriptive only; no mainland norms claims'],
  }
}
