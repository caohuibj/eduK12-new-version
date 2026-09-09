import { describe, expect, it } from 'vitest'
import {
  resolveScaleReference,
  validateReferenceSetDefinition,
  type AssessmentReferenceSetDefinition,
} from '../../modules/assessment-reference/reference'
import type { ScaleReferencePolicy } from '../../modules/scale/scale-definition'
import type { ScaleScoreValue } from '../../modules/scale/scale-scoring'

const score = (value: number | null = 60, status: ScaleScoreValue['status'] = 'calculated'): ScaleScoreValue => ({
  key: 'total',
  type: 'total',
  label: '总分',
  direction: 'descriptive',
  canonical: true,
  displayPrecision: 1,
  value,
  range: { min: 0, max: 100 },
  expectedItems: ['A'],
  answeredItems: value === null ? [] : ['A'],
  status,
  prorated: false,
})

const policyFor = (referenceVersion: string, referenceKind: 'normative_distribution' | 'criterion_threshold' | 'descriptive_sample'): ScaleReferencePolicy => ({
  type: 'declared',
  selections: [{ scoreKey: 'total', referenceVersion, referenceKind }],
})

const baseEntry = (overrides: Record<string, unknown> = {}) => ({
  scoreKey: 'total',
  referenceKind: 'normative_distribution' as const,
  evidenceLevel: 'literature_beta' as const,
  provenanceType: 'literature_reported' as const,
  instrumentVersion: '2.0.0',
  scoringVersion: '2.0.0',
  population: { description: '研究样本' },
  source: { citation: 'Reference source', publicationYear: 2024, sampleSize: 120 },
  statistics: { mean: 50, sd: 10 },
  ...overrides,
})

const setFor = (entry: Record<string, unknown>, overrides: Record<string, unknown> = {}): AssessmentReferenceSetDefinition => ({
  schemaVersion: 1,
  instrumentType: 'scale',
  instrumentKey: 'test-scale',
  referenceVersion: 'ref-1',
  status: 'ACTIVE',
  entries: [entry as AssessmentReferenceSetDefinition['entries'][number]],
  ...overrides,
})

describe('Assessment Reference Core', () => {
  it('validates criterion threshold boundaries and rejects gaps or overlaps', () => {
    const base = baseEntry({
      referenceKind: 'criterion_threshold',
      statistics: {
        thresholds: [
          { key: 'low', label: '低', minInclusive: 0, maxInclusive: 10 },
          { key: 'high', label: '高', minInclusive: 11, maxInclusive: 20 },
        ],
      },
    })
    expect(validateReferenceSetDefinition(setFor(base)).issues.filter((issue) => issue.severity === 'error')).toEqual([])

    const gap = setFor({ ...base, statistics: { thresholds: [{ key: 'low', label: '低', minInclusive: 0, maxInclusive: 10 }, { key: 'high', label: '高', minInclusive: 12, maxInclusive: 20 }] } })
    expect(validateReferenceSetDefinition(gap).issues.map((issue) => issue.message)).toContain('criterion threshold 存在间隙')

    const overlap = setFor({ ...base, statistics: { thresholds: [{ key: 'low', label: '低', minInclusive: 0, maxInclusive: 10 }, { key: 'high', label: '高', minInclusive: 10, maxInclusive: 20 }] } })
    expect(validateReferenceSetDefinition(overlap).issues.map((issue) => issue.message)).toContain('criterion threshold 存在重叠')
  })

  it('resolves normative z/T and direct or explicitly interpolated percentiles', () => {
    const direct = setFor(baseEntry({
      statistics: {
        mean: 50,
        sd: 10,
        percentileTable: [{ percentile: 10, score: 40 }, { percentile: 50, score: 50 }, { percentile: 90, score: 70 }],
      },
    }))
    const directResult = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [direct],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(50),
    })[0]
    expect(directResult).toMatchObject({ status: 'available', label: '文献 Beta 参考', mean: 50, sd: 10, z: 0, t: 50, percentile: { value: 50, estimated: false } })
    expect(directResult.disclaimer).toContain('不代表本地正式人口常模')

    const interpolated = setFor(baseEntry({
      statistics: {
        percentileTable: [{ percentile: 10, score: 40 }, { percentile: 50, score: 50 }, { percentile: 90, score: 70 }],
        percentileInterpolation: 'linear',
      },
    }))
    const interpolatedResult = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [interpolated],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })[0]
    expect(interpolatedResult.percentile).toEqual({ value: 70, estimated: true })
  })

  it('only estimates a percentile when normality is explicitly allowed', () => {
    const notAllowed = setFor(baseEntry({ statistics: { mean: 50, sd: 10 } }))
    expect(resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [notAllowed],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })[0].percentile).toBeNull()

    const allowed = setFor(baseEntry({
      statistics: { mean: 50, sd: 10 },
      derivation: { method: 'normal CDF estimate', distributionAssumption: 'normal', allowEstimatedPercentile: true },
    }))
    const result = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [allowed],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })[0]
    expect(result.percentile?.estimated).toBe(true)
    expect(result.percentile?.value).toBeCloseTo(84.13, 1)
  })

  it('uses criterion bands and descriptive differences without creating population positions', () => {
    const criterion = setFor(baseEntry({
      referenceKind: 'criterion_threshold',
      evidenceLevel: 'validated_norm',
      provenanceType: 'local_observed',
      statistics: { thresholds: [{ key: 'low', label: '低', minInclusive: 0, maxInclusive: 59 }, { key: 'high', label: '高', minInclusive: 60, maxInclusive: 100 }] },
    }))
    const criterionResult = resolveScaleReference({
      policy: policyFor('ref-1', 'criterion_threshold'),
      references: [criterion],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })[0]
    expect(criterionResult).toMatchObject({ referenceKind: 'criterion_threshold', criterionBand: { key: 'high', label: '高' }, percentile: null })

    const descriptive = setFor(baseEntry({
      referenceKind: 'descriptive_sample',
      statistics: { mean: 50, sd: 10 },
    }))
    const descriptiveResult = resolveScaleReference({
      policy: policyFor('ref-1', 'descriptive_sample'),
      references: [descriptive],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })[0]
    expect(descriptiveResult).toMatchObject({ referenceKind: 'descriptive_sample', meanDifference: 10, percentile: null, criterionBand: null })
  })

  it('requires a mean for descriptive samples because meanDifference is their only comparative statistic', () => {
    const missingMean = setFor(baseEntry({
      referenceKind: 'descriptive_sample',
      statistics: {},
    }))
    expect(validateReferenceSetDefinition(missingMean).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'entries.0.statistics.mean' }),
    ]))
  })

  it('requires exact versions and context, but accepts an unstratified reference', () => {
    const ageStratified = setFor(baseEntry({ population: { description: '按年龄分层', ageBand: 'K7-9' } }))
    const missingContext = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [ageStratified],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })[0]
    expect(missingContext).toMatchObject({ status: 'unavailable', unavailableReason: 'missing_context', percentile: null })

    const matchingContext = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [ageStratified],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
      context: { ageBand: 'K7-9' },
    })[0]
    expect(matchingContext.status).toBe('available')

    const versionMismatch = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [setFor(baseEntry({ instrumentVersion: '1.0.0' }))],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })[0]
    expect(versionMismatch).toMatchObject({ status: 'unavailable', unavailableReason: 'version_mismatch' })

    const unstratified = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [setFor(baseEntry())],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
      context: { ageBand: 'K7-9', language: 'zh-CN' },
    })[0]
    expect(unstratified.status).toBe('available')
  })

  it('honors none, unavailable scores, and the frozen Beta label', () => {
    const none = resolveScaleReference({
      policy: { type: 'none' },
      references: [],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(60),
    })
    expect(none).toEqual([])

    const unavailableScore = resolveScaleReference({
      policy: policyFor('ref-1', 'normative_distribution'),
      references: [setFor(baseEntry())],
      instrumentKey: 'test-scale',
      instrumentVersion: '2.0.0',
      scoringVersion: '2.0.0',
      score: score(null, 'not_calculable'),
    })[0]
    expect(unavailableScore).toMatchObject({ status: 'unavailable', unavailableReason: 'insufficient_data' })
  })
})
