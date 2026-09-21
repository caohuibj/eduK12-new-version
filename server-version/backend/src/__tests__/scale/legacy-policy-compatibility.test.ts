import { describe, expect, it } from 'vitest'
import {
  getLegacyScaleCompatibilityProfile,
  listLegacyScaleCompatibilityProfiles,
} from '../../modules/scale/policy/legacy-profile'
import { listScalePackages } from '../../modules/scale/scale-package.registry'

describe('legacy scale compatibility profiles', () => {
  it('covers exactly the six legacy executable identities', () => {
    const packageIds = listScalePackages().map((pkg) => `${pkg.key}:${pkg.instrumentVersion}`).sort()
    const profileIds = listLegacyScaleCompatibilityProfiles()
      .map((profile) => `${profile.identity.instrumentKey}:${profile.identity.instrumentVersion}`)
      .sort()
    expect(profileIds).toEqual(packageIds)
  })

  it('does not synthesize an unrestricted profile for unknown identities', () => {
    expect(getLegacyScaleCompatibilityProfile('unknown_scale', '1.0.0')).toBeUndefined()
  })

  it('marks old eligibility as not evaluated and preserves existing access restrictions', () => {
    for (const profile of listLegacyScaleCompatibilityProfiles()) {
      expect(profile.eligibilityDisposition).toBe('LEGACY_NOT_EVALUATED')
      expect(profile.preserveExistingAccessRestrictions).toBe(true)
      expect(profile.disclosure.unknownAudience).toBe('DENY')
    }
  })
})
