import { DISCLOSURE_PRESETS } from '../policy/disclosure'
import { getLegacyScaleCompatibilityProfile } from '../policy/legacy-profile'
import type { CompiledScalePolicyV1 } from '../policy/compile'
import type { EffectiveScaleDisclosureSnapshot } from './types'

const fullLegacyDisclosure = () => ({
  schemaVersion: 1 as const,
  policyVersion: 'legacy-custom-descriptive-v1',
  audiences: {
    respondent: DISCLOSURE_PRESETS.FULL_REPORT(),
    subject: DISCLOSURE_PRESETS.FULL_REPORT(),
    teacher: DISCLOSURE_PRESETS.FULL_REPORT(),
    researcher: DISCLOSURE_PRESETS.FULL_REPORT(),
  },
  unknownAudience: 'DENY' as const,
})

const unknownPolicy = (): EffectiveScaleDisclosureSnapshot => ({
  disposition: 'UNKNOWN',
  disclosure: {
    schemaVersion: 1,
    policyVersion: 'unknown-deny-v1',
    audiences: {},
    unknownAudience: 'DENY',
  },
})

export const scaleProjectionPolicyFromCompiled = (
  policy: CompiledScalePolicyV1,
): EffectiveScaleDisclosureSnapshot => ({
  disposition: 'FROZEN_V2',
  disclosure: policy.disclosure,
  ...(policy.educationalFeedback ? { educationalFeedback: policy.educationalFeedback } : {}),
  runtimePolicyHash: policy.runtimePolicyHash,
})

export const resolveLegacyScaleProjectionPolicy = (
  instrumentKey: string,
  instrumentVersion: string,
  instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE' | null,
): EffectiveScaleDisclosureSnapshot => {
  if (instrumentClass === 'CUSTOM_DESCRIPTIVE') {
    return { disposition: 'LEGACY_PROFILE', disclosure: fullLegacyDisclosure() }
  }
  const profile = getLegacyScaleCompatibilityProfile(instrumentKey, instrumentVersion)
  if (!profile) return unknownPolicy()
  return {
    disposition: 'LEGACY_PROFILE',
    disclosure: profile.disclosure,
  }
}

export const denyAllScaleProjectionPolicy = unknownPolicy
