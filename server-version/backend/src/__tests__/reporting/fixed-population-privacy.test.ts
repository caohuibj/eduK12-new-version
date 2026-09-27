import { describe, expect, it } from 'vitest'
import { assertFixedPopulationProjection } from '../../modules/reporting/fixedPopulationPrivacy'
import type { ReportingCohortSnapshotRecord } from '../../modules/reporting/types'

const cohort = (id: string, users: string[]): ReportingCohortSnapshotRecord => ({
  id, organizationId: 'org', sourceRunId: `run-${id}`, sourceTrackId: `track-${id}`,
  selector: { kind: 'RUN_TRACK_SUBJECTS' }, eligibleN: users.length,
  members: users.map((userId) => ({ userId, membershipId: `membership-${userId}`, executionId: `${id}-${userId}` })),
} as ReportingCohortSnapshotRecord)
const users = ['a', 'b', 'c', 'd']
const first = cohort('first', users)
const second = cohort('second', users)
const metric = (n = 4) => ({ state: 'present', validN: n, missingN: 4 - n, aggregations: { mean: 7 } })
const group = (n = 4) => ({ kind: 'GROUP', state: 'present', eligibleN: 4, resultContributorN: 4, metrics: { score: metric(n) } })
const bindings = [{ waveId: 'w1', cohortSnapshotId: first.id }, { waveId: 'w2', cohortSnapshotId: second.id }]
const checkGroup = (projection: unknown) => assertFixedPopulationProjection({ analysisKind: 'GROUP', projection, cohorts: [first] })
const checkMatched = (projection: unknown, cohorts = [first, second]) => assertFixedPopulationProjection({
  analysisKind: 'MATCHED_LONGITUDINAL', projection, cohorts, waveBindings: bindings,
})

describe('ordinary fixed-population numerical disclosure', () => {
  it('preserves a complete aggregate without changing its numbers or object', () => {
    const projection = group()
    const before = JSON.stringify(projection)
    expect(() => checkGroup(projection)).not.toThrow()
    expect(JSON.stringify(projection)).toBe(before)
  })

  it('checks actual metric contributors rather than completed or eligible counts', () => {
    expect(() => checkGroup(group(3))).toThrowError(expect.objectContaining({ code: 'REPORT_PRIVACY_GUARD' }))
    expect(() => checkGroup({ ...group(), resultContributorN: 3 })).toThrow()
  })

  it('never exposes a 3-person partial mean followed by the 4-person complete mean', () => {
    const partial = { ...group(3), resultContributorN: 3 }
    expect(() => checkGroup(partial)).toThrow()
    expect(() => checkGroup(group(4))).not.toThrow()
  })

  it('permits a genuinely suppressed metric but not a renamed incomplete metric', () => {
    expect(() => checkGroup({ ...group(), metrics: { score: { state: 'suppressed' } } })).not.toThrow()
    expect(() => checkGroup({ ...group(), metrics: { renamed: metric(3) } })).toThrow()
  })

  it('checks every independent repeated-cohort Wave against its own full population', () => {
    const projection = { kind: 'REPEATED_COHORT', state: 'present', waves: [
      { ...group(), waveId: 'w1' }, { ...group(3), waveId: 'w2' },
    ] }
    expect(() => assertFixedPopulationProjection({ analysisKind: 'REPEATED_COHORT', projection, cohorts: [first, second], waveBindings: bindings })).toThrow()
    projection.waves[1] = { ...group(), waveId: 'w2' }
    expect(() => assertFixedPopulationProjection({ analysisKind: 'REPEATED_COHORT', projection, cohorts: [first, second], waveBindings: bindings })).not.toThrow()
    projection.waves[1].waveId = 'w1'
    expect(() => assertFixedPopulationProjection({ analysisKind: 'REPEATED_COHORT', projection, cohorts: [first, second], waveBindings: bindings })).toThrow()
  })

  it.each(['PAIRWISE', 'FULL_CASE'])('does not let %s intersect away one person', (mode) => {
    const projection = { kind: 'MATCHED_LONGITUDINAL', mode, state: 'present', matchedEligibleN: 4,
      metrics: { score: { state: 'present', validCaseN: 4, waveMeans: [{ mean: 7 }, { mean: 8 }] } } }
    expect(() => checkMatched(projection)).not.toThrow()
    expect(() => checkMatched({ ...projection, metrics: { score: { ...projection.metrics.score, validCaseN: 3 } } })).toThrow()
    expect(() => checkMatched(projection, [first, cohort('second', ['a', 'b', 'c', 'other'])])).toThrow()
  })

  it('fails closed for an unmatched Wave binding or malformed projection', () => {
    expect(() => assertFixedPopulationProjection({ analysisKind: 'REPEATED_COHORT', projection: {}, cohorts: [first, second], waveBindings: bindings })).toThrow()
    expect(() => checkMatched({ kind: 'MATCHED_LONGITUDINAL', state: 'present', matchedEligibleN: 4 }, [first])).toThrow()
  })
})
