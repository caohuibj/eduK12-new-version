import { describe, expect, it } from 'vitest'
import {
  DISCLOSURE_PRESETS,
  intersectDisclosureCapabilities,
  resolveAudienceDisclosure,
} from '../../modules/scale/policy/disclosure'
import type { AudienceDisclosurePolicyV1 } from '../../modules/scale/policy/types'

const policy: AudienceDisclosurePolicyV1 = {
  schemaVersion: 1,
  policyVersion: 'test-v1',
  audiences: {
    respondent: DISCLOSURE_PRESETS.EDUCATIONAL_ONLY(),
    researcher: DISCLOSURE_PRESETS.FULL_REPORT(),
  },
  unknownAudience: 'DENY',
}

describe('scale disclosure policy', () => {
  it('does not grant raw answers through FULL_REPORT', () => {
    expect(DISCLOSURE_PRESETS.FULL_REPORT().rawAnswers).toBe(false)
  })

  it('denies unknown or undeclared audiences', () => {
    expect(Object.values(resolveAudienceDisclosure(policy, 'admin')).some(Boolean)).toBe(false)
    expect(Object.values(resolveAudienceDisclosure(policy, 'teacher')).some(Boolean)).toBe(false)
  })

  it('intersects capabilities monotonically', () => {
    const full = DISCLOSURE_PRESETS.FULL_REPORT()
    const educational = DISCLOSURE_PRESETS.EDUCATIONAL_ONLY()
    const intersection = intersectDisclosureCapabilities(full, educational)
    expect(intersection.educationalContent).toBe(true)
    expect(intersection.numericScores).toBe(false)
    expect(intersection.references).toBe(false)
    expect(intersection.itemScores).toBe(false)
  })

  it('keeps educational-only score independent at the capability layer', () => {
    const resolved = resolveAudienceDisclosure(policy, 'respondent')
    expect(resolved).toEqual(DISCLOSURE_PRESETS.EDUCATIONAL_ONLY())
  })
})
