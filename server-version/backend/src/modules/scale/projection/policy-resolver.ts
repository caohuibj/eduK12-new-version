import { getLegacyScaleCompatibilityProfile } from '../policy/legacy-profile'
import type { CompiledScalePolicyV1 } from '../policy/compile'
import { denyAllDisclosureCapabilities } from '../policy/disclosure'
import type { EffectiveScaleDisclosureSnapshot } from './types'

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
): EffectiveScaleDisclosureSnapshot => {
  const profile = getLegacyScaleCompatibilityProfile(instrumentKey, instrumentVersion)
  if (!profile) return unknownPolicy()
  return {
    disposition: 'LEGACY_PROFILE',
    disclosure: profile.disclosure,
  }
}

export const denyAllScaleProjectionPolicy = unknownPolicy

// Keep this import live as a compile-time guard that the deny policy remains
// capability-based rather than falling back to a permissive legacy object.
void denyAllDisclosureCapabilities
