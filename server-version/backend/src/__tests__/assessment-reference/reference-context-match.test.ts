import { describe, expect, it } from 'vitest'
import {
  resolveScaleReference,
  validateReferenceSetDefinition,
  type AssessmentReferenceSetDefinition,
} from '../../modules/assessment-reference/reference'

const score = { key: 'total', type: 'total' as const, label: '总分', direction: 'descriptive' as const, canonical: true, displayPrecision: 0, value: 10, range: { min: 0, max: 20 }, expectedItems: ['Q1'], answeredItems: ['Q1'], status: 'calculated' as const, prorated: false }
const policy = { type: 'declared' as const, selections: [{ scoreKey: 'total', referenceVersion: 'ref-1', referenceKind: 'normative_distribution' as const }] }
const entry = (population: Record<string, unknown>) => ({
  scoreKey: 'total',
  referenceKind: 'normative_distribution' as const,
  evidenceLevel: 'literature_beta' as const,
  provenanceType: 'literature_reported' as const,
  instrumentVersion: '1.0.0',
  scoringVersion: '1.0.0',
  population,
  source: { citation: 'source' },
  statistics: { mean: 10, sd: 2 },
})
const setFor = (entries: any[]): AssessmentReferenceSetDefinition => ({
  schemaVersion: 1,
  instrumentType: 'scale',
  instrumentKey: 'scale-1',
  referenceVersion: 'ref-1',
  status: 'ACTIVE',
  entries,
})

describe('Assessment Reference population matching', () => {
  it('matches age boundaries and returns missing/no-match reasons', () => {
    const reference = setFor([entry({ match: { minAgeMonthsInclusive: 120, maxAgeMonthsExclusive: 144 } })])
    const base = { policy, references: [reference], instrumentKey: 'scale-1', instrumentVersion: '1.0.0', scoringVersion: '1.0.0', score }
    expect(resolveScaleReference({ ...base, context: { ageMonthsAtFreeze: 120 } })[0].status).toBe('available')
    expect(resolveScaleReference({ ...base, context: { ageMonthsAtFreeze: 144 } })[0].unavailableReason).toBe('no_population_match')
    expect(resolveScaleReference(base)[0].unavailableReason).toBe('missing_context')
  })

  it('matches sex, grade, language, and country without nearest-group fallback', () => {
    const reference = setFor([entry({ match: { sexAtBirth: ['female'], gradeLevels: ['7'], primaryLanguages: ['zh-CN'], countriesOrRegions: ['CN'] } })])
    const base = { policy, references: [reference], instrumentKey: 'scale-1', instrumentVersion: '1.0.0', scoringVersion: '1.0.0', score }
    expect(resolveScaleReference({ ...base, context: { sexAtBirth: 'female', gradeLevel: '7', primaryLanguage: 'zh-CN', countryOrRegion: 'CN' } })[0].status).toBe('available')
    expect(resolveScaleReference({ ...base, context: { sexAtBirth: 'male', gradeLevel: '7', primaryLanguage: 'zh-CN', countryOrRegion: 'CN' } })[0].unavailableReason).toBe('no_population_match')
  })

  it('rejects overlapping population definitions and ambiguous runtime matches', () => {
    const overlapping = validateReferenceSetDefinition(setFor([
      entry({ match: { minAgeMonthsInclusive: 120, maxAgeMonthsExclusive: 144 } }),
      entry({ match: { minAgeMonthsInclusive: 140, maxAgeMonthsExclusive: 160 } }),
    ]))
    expect(overlapping.issues.some((issue) => issue.message.includes('重叠'))).toBe(true)

    const ambiguous = setFor([
      entry({ match: { gradeLevels: ['7'] } }),
      entry({ match: { primaryLanguages: ['zh-CN'] } }),
    ])
    expect(resolveScaleReference({
      policy,
      references: [ambiguous],
      instrumentKey: 'scale-1',
      instrumentVersion: '1.0.0',
      scoringVersion: '1.0.0',
      score,
      context: { gradeLevel: '7', primaryLanguage: 'zh-CN' },
    })[0].unavailableReason).toBe('ambiguous_population')
  })
})
