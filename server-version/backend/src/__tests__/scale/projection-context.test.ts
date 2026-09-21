import { describe, expect, it } from 'vitest'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import { resolveEffectiveScaleDisclosure } from '../../modules/scale/projection/context'
import { createScaleProjectionContext } from '../../modules/scale/projection/context-factory'

describe('Scale projection context identity resolution', () => {
  it('fails closed for an unknown instrument identity instead of inferring CUSTOM_DESCRIPTIVE', () => {
    const context = createScaleProjectionContext({
      instrumentKey: 'future_unknown_scale',
      instrumentVersion: '9.9.9',
      audience: 'teacher',
      purpose: 'report',
    })

    expect(context.frozenPolicy.disposition).toBe('UNKNOWN')
    expect(resolveEffectiveScaleDisclosure(context)).toEqual(DISCLOSURE_PRESETS.NONE())
  })

  it('fails closed for an explicitly STANDARD identity that has no known package/profile', () => {
    const context = createScaleProjectionContext({
      instrumentKey: 'future_unknown_standard',
      instrumentVersion: '1.0.0',
      instrumentClass: 'STANDARD',
      audience: 'teacher',
      purpose: 'export',
    })

    expect(context.frozenPolicy.disposition).toBe('UNKNOWN')
    expect(resolveEffectiveScaleDisclosure(context)).toEqual(DISCLOSURE_PRESETS.NONE())
  })

  it('allows legacy custom-descriptive compatibility only when the authoritative class is explicit', () => {
    const context = createScaleProjectionContext({
      instrumentKey: 'custom_descriptive_example',
      instrumentVersion: '1.0.0',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      audience: 'teacher',
      purpose: 'report',
    })

    expect(context.frozenPolicy.disposition).toBe('LEGACY_PROFILE')
    expect(resolveEffectiveScaleDisclosure(context)).toEqual(DISCLOSURE_PRESETS.FULL_REPORT())
  })
})
