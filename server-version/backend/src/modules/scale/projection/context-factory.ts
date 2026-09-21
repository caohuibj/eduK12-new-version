import { getScalePackage } from '../scale-package.registry'
import { DISCLOSURE_PRESETS } from '../policy/disclosure'
import type { ScaleDisclosureAudience } from '../policy/types'
import { resolveLegacyScaleProjectionPolicy } from './policy-resolver'
import type { EffectiveScaleDisclosureSnapshot, ScaleProjectionContext, ScaleProjectionPurpose, ScaleRelationalDisposition } from './types'

export const createScaleProjectionContext = (input: {
  instrumentKey?: string | null
  instrumentVersion?: string | null
  audience: ScaleDisclosureAudience
  purpose: ScaleProjectionPurpose
  principalId?: string | null
  relationalDisposition?: ScaleRelationalDisposition
  frozenPolicy?: EffectiveScaleDisclosureSnapshot
}): ScaleProjectionContext => {
  const full = DISCLOSURE_PRESETS.FULL_REPORT()
  let frozenPolicy = input.frozenPolicy
  if (!frozenPolicy && input.instrumentKey && input.instrumentVersion) {
    const executable = getScalePackage(input.instrumentKey, input.instrumentVersion)
    frozenPolicy = resolveLegacyScaleProjectionPolicy(
      input.instrumentKey,
      input.instrumentVersion,
      executable ? 'STANDARD' : 'CUSTOM_DESCRIPTIVE',
    )
  }
  frozenPolicy ??= resolveLegacyScaleProjectionPolicy('', '')
  return {
    principalId: input.principalId ?? null,
    audience: input.audience,
    purpose: input.purpose,
    accessDecision: { source: 'RESOURCE_AUTHORIZATION', allowed: true, capabilities: full },
    frozenPolicy,
    currentRestrictions: full,
    relationalDisposition: input.relationalDisposition ?? 'NON_RELATIONAL',
  }
}
