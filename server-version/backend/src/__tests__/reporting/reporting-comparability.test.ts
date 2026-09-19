import { describe, expect, it } from 'vitest'
import {
  assertNumericDeltaAllowed,
  resolveReportingComparability,
  validateComparabilityRule,
} from '../../modules/reporting/comparability'
import type { ReportingComparabilityRuleV1 } from '../../modules/reporting/types'

const evidenceHash = 'a'.repeat(64)
const baseRule = (level: ReportingComparabilityRuleV1['level']): ReportingComparabilityRuleV1 => ({
  schemaVersion: 1,
  metricId: 'score',
  resourceFamily: 'SCALE',
  resourceKey: 'wellbeing',
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  level,
  evidenceRef: 'platform-spec:wellbeing-link-1',
  evidenceHash,
})

describe('reporting comparability governance', () => {
  it('fails closed without reviewed comparability evidence', () => {
    const decision = resolveReportingComparability({
      metricId: 'score',
      left: { family: 'SCALE', key: 'wellbeing', version: '1.0.0' },
      right: { family: 'SCALE', key: 'wellbeing', version: '1.0.0' },
    })
    expect(decision.level).toBe('NOT_COMPARABLE')
    expect(decision.allowedOperations).toEqual(['SIDE_BY_SIDE'])
    expect(() => assertNumericDeltaAllowed(decision)).toThrow()
  })

  it.each(['EXACT', 'COMPATIBLE', 'LINKED'] as const)('%s evidence permits numeric delta', (level) => {
    const decision = resolveReportingComparability({
      metricId: 'score',
      left: { family: 'SCALE', key: 'wellbeing', version: '1.0.0' },
      right: { family: 'SCALE', key: 'wellbeing', version: '1.1.0' },
      rule: baseRule(level),
    })
    expect(decision.level).toBe(level)
    expect(decision.allowedOperations).toContain('NUMERIC_DELTA')
    expect(() => assertNumericDeltaAllowed(decision)).not.toThrow()
  })

  it('LIMITED evidence permits descriptive trend but not numeric delta', () => {
    const decision = resolveReportingComparability({
      metricId: 'score',
      left: { family: 'SCALE', key: 'wellbeing', version: '1.0.0' },
      right: { family: 'SCALE', key: 'wellbeing', version: '1.1.0' },
      rule: baseRule('LIMITED'),
    })
    expect(decision.allowedOperations).toEqual(['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND'])
    expect(() => assertNumericDeltaAllowed(decision)).toThrow()
  })

  it('does not apply evidence to a different metric or resource identity', () => {
    const metricMismatch = resolveReportingComparability({
      metricId: 'other',
      left: { family: 'SCALE', key: 'wellbeing', version: '1.0.0' },
      right: { family: 'SCALE', key: 'wellbeing', version: '1.1.0' },
      rule: baseRule('EXACT'),
    })
    expect(metricMismatch.level).toBe('NOT_COMPARABLE')
    expect(metricMismatch.limitations).toContain('COMPARABILITY_RULE_SCOPE_MISMATCH')

    const resourceMismatch = resolveReportingComparability({
      metricId: 'score',
      left: { family: 'SCALE', key: 'wellbeing', version: '1.0.0' },
      right: { family: 'SCALE', key: 'other', version: '1.1.0' },
      rule: baseRule('EXACT'),
    })
    expect(resourceMismatch.limitations).toContain('RESOURCE_IDENTITY_MISMATCH')
  })

  it('requires explicit evidence identity and hash for every positive rule', () => {
    expect(() => validateComparabilityRule({ ...baseRule('LINKED'), evidenceHash: 'not-a-hash' })).toThrow()
    expect(() => validateComparabilityRule({ ...baseRule('COMPATIBLE'), evidenceRef: ' ' })).toThrow()
  })
})
