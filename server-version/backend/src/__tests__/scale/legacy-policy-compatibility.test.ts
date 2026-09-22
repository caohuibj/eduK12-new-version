import { describe, expect, it } from 'vitest'
import {
  getLegacyScaleCompatibilityProfile,
  listLegacyScaleCompatibilityProfiles,
} from '../../modules/scale/policy/legacy-profile'
import { listScalePackages } from '../../modules/scale/scale-package.registry'

const LEGACY_EXECUTABLE_IDENTITIES = [
  'adexi_v1:2.0.0',
  'who5:1.0.0',
  'sdq_parent_zh_cn:1.0.0',
  'sdq_teacher_zh_cn:1.0.0',
  'texi_parent_zh_cn:1.0.0',
  'texi_teacher_zh_cn:1.0.0',
] as const

describe('legacy scale compatibility profiles', () => {
  it('covers exactly the six legacy executable identities without claiming future packages are legacy', () => {
    const profileIds = listLegacyScaleCompatibilityProfiles()
      .map((profile) => `${profile.identity.instrumentKey}:${profile.identity.instrumentVersion}`)
      .sort()
    expect(profileIds).toEqual([...LEGACY_EXECUTABLE_IDENTITIES].sort())

    const packageIds = new Set(listScalePackages().map((pkg) => `${pkg.key}:${pkg.instrumentVersion}`))
    LEGACY_EXECUTABLE_IDENTITIES.forEach((identity) => expect(packageIds.has(identity)).toBe(true))

    for (const pkg of listScalePackages()) {
      const identity = `${pkg.key}:${pkg.instrumentVersion}`
      if (!LEGACY_EXECUTABLE_IDENTITIES.includes(identity as typeof LEGACY_EXECUTABLE_IDENTITIES[number])) {
        expect(getLegacyScaleCompatibilityProfile(pkg.key, pkg.instrumentVersion)).toBeUndefined()
      }
    }
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
