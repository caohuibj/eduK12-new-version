import { describe, expect, it } from 'vitest'
import type { IndividualProjection, MatchedProjection, RepeatedProjection } from '../../../api/reporting'
import { toIndividualTrend, toMatchedTrend, toRepeatedTrend } from '../longitudinalVisualization'

const label = (ordinal: number) => `Wave ${ordinal}`

const decision = (level: string, allowedOperations: string[]) => ({
  schemaVersion: 1 as const,
  metricId: 'score',
  level,
  allowedOperations,
  evidenceRef: null,
  evidenceHash: null,
  limitations: [],
})

describe('longitudinal visualization adapter', () => {
  it('uses only server-projected matched values and delta', () => {
    const projection: MatchedProjection = {
      schemaVersion: 1,
      kind: 'MATCHED_LONGITUDINAL',
      mode: 'FULL_CASE',
      state: 'present',
      waveIds: ['secret-a', 'secret-b'],
      matchedEligibleN: 10,
      evidence: { level: 'PILOT', limitations: [] },
      metrics: {
        score: {
          state: 'present',
          validCaseN: 10,
          waveMeans: [
            { waveId: 'secret-a', waveKey: 'A', mean: 3 },
            { waveId: 'secret-b', waveKey: 'B', mean: 8 },
          ],
          comparisons: [{
            fromWaveId: 'secret-a',
            toWaveId: 'secret-b',
            comparability: decision('EXACT', ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA']),
            delta: 4.25,
          }],
        },
      },
    }

    const model = toMatchedTrend(projection, 'score', label)
    expect(model.state).toBe('comparable')
    expect(model.points.map((point) => point.value)).toEqual([3, 8])
    expect(model.segments[0]).toMatchObject({ connect: true, delta: 4.25 })
    expect(JSON.stringify(model)).not.toContain('secret-')
  })

  it('never calculates a missing delta in the browser', () => {
    const projection: MatchedProjection = {
      schemaVersion: 1,
      kind: 'MATCHED_LONGITUDINAL',
      mode: 'PAIRWISE',
      state: 'present',
      waveIds: ['w1', 'w2'],
      evidence: { level: 'PILOT', limitations: [] },
      metrics: {
        score: {
          state: 'present',
          waveMeans: [
            { waveId: 'w1', waveKey: 'A', mean: 3 },
            { waveId: 'w2', waveKey: 'B', mean: 8 },
          ],
          comparisons: [{
            fromWaveId: 'w1',
            toWaveId: 'w2',
            comparability: decision('EXACT', ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA']),
          }],
        },
      },
    }

    const model = toMatchedTrend(projection, 'score', label)
    expect(model.segments[0].connect).toBe(true)
    expect(model.segments[0].delta).toBeUndefined()
  })

  it('does not connect NOT_COMPARABLE matched points', () => {
    const projection: MatchedProjection = {
      schemaVersion: 1,
      kind: 'MATCHED_LONGITUDINAL',
      mode: 'PAIRWISE',
      state: 'present',
      waveIds: ['w1', 'w2'],
      evidence: { level: 'PILOT', limitations: [] },
      metrics: {
        score: {
          state: 'present',
          waveMeans: [
            { waveId: 'w1', waveKey: 'A', mean: 10 },
            { waveId: 'w2', waveKey: 'B', mean: 12 },
          ],
          comparisons: [{
            fromWaveId: 'w1',
            toWaveId: 'w2',
            comparability: decision('NOT_COMPARABLE', ['SIDE_BY_SIDE']),
          }],
        },
      },
    }

    const model = toMatchedTrend(projection, 'score', label)
    expect(model.state).toBe('not_comparable')
    expect(model.segments[0].connect).toBe(false)
  })

  it('fails closed for a suppressed metric even when malformed extra values exist', () => {
    const projection = {
      schemaVersion: 1,
      kind: 'MATCHED_LONGITUDINAL',
      mode: 'FULL_CASE',
      state: 'present',
      waveIds: ['private-a', 'private-b'],
      evidence: { level: 'PILOT', limitations: [] },
      metrics: {
        score: {
          state: 'suppressed',
          waveMeans: [
            { waveId: 'private-a', waveKey: 'A', mean: 99 },
            { waveId: 'private-b', waveKey: 'B', mean: 100 },
          ],
        },
      },
    } as unknown as MatchedProjection

    const model = toMatchedTrend(projection, 'score', label)
    expect(model).toEqual({
      metricId: 'score',
      state: 'suppressed',
      points: [],
      segments: [],
      hasSuppressedValues: true,
    })
    expect(JSON.stringify(model)).not.toContain('99')
  })

  it('uses only an explicit server-projected mean for repeated cohorts', () => {
    const projection: RepeatedProjection = {
      schemaVersion: 1,
      kind: 'REPEATED_COHORT',
      state: 'present',
      limitations: [],
      waves: [
        {
          waveId: 'r1',
          waveKey: 'A',
          ordinal: 1,
          state: 'present',
          eligibleN: 20,
          resultContributorN: 20,
          evidence: { level: 'PILOT', limitations: [] },
          metrics: { score: { state: 'present', aggregations: { median: 4, mean: 5 } } },
        },
        {
          waveId: 'r2',
          waveKey: 'B',
          ordinal: 2,
          state: 'present',
          eligibleN: 20,
          resultContributorN: 20,
          evidence: { level: 'PILOT', limitations: [] },
          metrics: { score: { state: 'present', aggregations: { median: 7, mean: 8 } } },
        },
      ],
      comparisons: [{
        fromWaveId: 'r1',
        toWaveId: 'r2',
        metrics: { score: decision('LIMITED', ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND']) },
      }],
    }

    const model = toRepeatedTrend(projection, 'score', label)
    expect(model.points.map((point) => point.value)).toEqual([5, 8])
    expect(model.segments[0]).toMatchObject({ connect: true, comparabilityLevel: 'LIMITED' })
    expect(model.segments[0].delta).toBeUndefined()
  })

  it('does not infer a repeated-cohort mean from another aggregation', () => {
    const projection: RepeatedProjection = {
      schemaVersion: 1,
      kind: 'REPEATED_COHORT',
      state: 'present',
      limitations: [],
      waves: [1, 2].map((ordinal) => ({
        waveId: `r${ordinal}`,
        waveKey: String(ordinal),
        ordinal,
        state: 'present' as const,
        evidence: { level: 'PILOT' as const, limitations: [] },
        metrics: { score: { state: 'present' as const, aggregations: { median: ordinal * 2 } } },
      })),
      comparisons: [],
    }

    const model = toRepeatedTrend(projection, 'score', label)
    expect(model.state).toBe('unavailable')
    expect(model.points.every((point) => point.value === null)).toBe(true)
  })

  it('keeps missing individual waves as gaps and consumes only server delta', () => {
    const projection: IndividualProjection = {
      schemaVersion: 1,
      kind: 'INDIVIDUAL_LONGITUDINAL',
      state: 'present',
      limitations: [],
      waves: [
        { waveId: 'i1', waveKey: 'A', ordinal: 1, evidence: { level: 'PILOT', limitations: [] }, metrics: { score: { state: 'present', value: 10 } } },
        { waveId: 'i2', waveKey: 'B', ordinal: 2, evidence: { level: 'PILOT', limitations: [] }, metrics: { score: { state: 'missing', reason: 'missing' } } },
        { waveId: 'i3', waveKey: 'C', ordinal: 3, evidence: { level: 'PILOT', limitations: [] }, metrics: { score: { state: 'present', value: 14 } } },
      ],
      comparisons: [
        { fromWaveId: 'i1', toWaveId: 'i2', metrics: { score: { comparability: decision('EXACT', ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA']) } } },
        { fromWaveId: 'i2', toWaveId: 'i3', metrics: { score: { comparability: decision('EXACT', ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA']) } } },
      ],
    }

    const model = toIndividualTrend(projection, 'score', label)
    expect(model.points.map((point) => point.value)).toEqual([10, null, 14])
    expect(model.segments.every((segment) => segment.connect === false)).toBe(true)
    expect(model.segments.every((segment) => segment.delta === undefined)).toBe(true)
  })
})
