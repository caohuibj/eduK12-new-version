import { describe, expect, it } from 'vitest'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { resolveCognitiveMetricReferences } from '../../modules/cognitive/v2/reference-adapter'
import type { AssessmentReferenceSetDefinition } from '../../modules/assessment-reference/reference'

const definition = () => {
  const base = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
  if (!base) throw new Error('reaction v1.1 definition missing')
  return {
    ...base,
    references: [{
      metricKey: 'medianRtMs',
      referenceVersion: 'beta-v1',
      referenceKind: 'normative_distribution' as const,
      evidenceLevel: 'literature_beta' as const,
      instrumentVersion: '1.0.0',
      scoringVersion: '1.1.0',
      direction: base.metrics.medianRtMs.direction,
      requiredContext: ['age' as const],
    }],
  }
}

const referenceSet = (entries: AssessmentReferenceSetDefinition['entries']): AssessmentReferenceSetDefinition => ({
  schemaVersion: 1,
  instrumentType: 'cognitive',
  instrumentKey: 'reaction',
  referenceVersion: 'beta-v1',
  status: 'ACTIVE',
  entries,
})

const entry = (population: AssessmentReferenceSetDefinition['entries'][number]['population']): AssessmentReferenceSetDefinition['entries'][number] => ({
  scoreKey: 'medianRtMs',
  referenceKind: 'normative_distribution',
  evidenceLevel: 'literature_beta',
  provenanceType: 'literature_derived_estimate',
  instrumentVersion: '1.0.0',
  scoringVersion: '1.1.0',
  population,
  source: { citation: 'Fixture literature beta', publicationYear: 2024, sampleSize: 48 },
  statistics: { mean: 300, sd: 50 },
  derivation: { distributionAssumption: 'normal', allowEstimatedPercentile: true },
  disclaimer: 'Fixture only; not a local norm.',
})

describe('Cognitive v2 shared reference and context adapter', () => {
  it('returns an explicit missing_context result instead of choosing a population', () => {
    const result = resolveCognitiveMetricReferences({
      definition: definition(),
      metrics: { medianRtMs: 350 },
      references: [referenceSet([entry({ match: { minAgeMonthsInclusive: 84, maxAgeMonthsExclusive: 120 } })])],
      context: null,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ status: 'unavailable', unavailableReason: 'missing_context' })
  })

  it('returns no_population_match for a complete but out-of-range context', () => {
    const result = resolveCognitiveMetricReferences({
      definition: definition(),
      metrics: { medianRtMs: 350 },
      references: [referenceSet([entry({ match: { minAgeMonthsInclusive: 84, maxAgeMonthsExclusive: 120 } })])],
      context: { values: { ageMonthsAtFreeze: 156 } } as never,
    })
    expect(result[0]).toMatchObject({ status: 'unavailable', unavailableReason: 'no_population_match' })
  })

  it('does not select an ambiguous overlapping population', () => {
    const result = resolveCognitiveMetricReferences({
      definition: definition(),
      metrics: { medianRtMs: 350 },
      references: [referenceSet([
        entry({ match: { minAgeMonthsInclusive: 84, maxAgeMonthsExclusive: 120 } }),
        entry({ match: { minAgeMonthsInclusive: 100, maxAgeMonthsExclusive: 140 } }),
      ])],
      context: { values: { ageMonthsAtFreeze: 108 } } as never,
    })
    expect(result[0]).toMatchObject({ status: 'unavailable', unavailableReason: 'ambiguous_population' })
  })

  it('keeps literature beta provenance and derives a labeled percentile only when matched', () => {
    const result = resolveCognitiveMetricReferences({
      definition: definition(),
      metrics: { medianRtMs: 350 },
      references: [referenceSet([entry({ match: { minAgeMonthsInclusive: 84, maxAgeMonthsExclusive: 120 } })])],
      context: { values: { ageMonthsAtFreeze: 108 } } as never,
    })
    expect(result[0]).toMatchObject({
      status: 'available',
      evidenceLevel: 'literature_beta',
      percentile: { estimated: true },
      relativePosition: 'above_reference',
    })
    expect(result[0].disclaimer).toContain('Beta')
  })
})
