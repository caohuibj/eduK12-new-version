import { describe, expect, it } from 'vitest'
import {
  buildReportingWaveInputManifest,
  reportingWaveInputIdentity,
  validateReportingSeriesScope,
} from '../../modules/reporting/series'
import type { ReportingResultBatchV1 } from '../../modules/reporting/types'

const batch = (): ReportingResultBatchV1 => ({
  resourceFamily: 'SCALE',
  resourceKey: 'wellbeing',
  resourceVersion: '1.0.0',
  resourceMinimumN: 5,
  resolved: [
    {
      executionId: 'e2',
      subjectUserId: 'u2',
      membershipId: 'm2',
      trackId: 't1',
      canonicalResultHash: 'b'.repeat(64),
      metrics: [],
      scientificMaturity: 'PILOT',
      provenanceState: 'FROZEN',
      scientificProvenanceHash: 'c'.repeat(64),
    },
    {
      executionId: 'e1',
      subjectUserId: 'u1',
      membershipId: 'm1',
      trackId: 't1',
      canonicalResultHash: 'a'.repeat(64),
      metrics: [],
      scientificMaturity: 'RESEARCH_READY',
      provenanceState: 'FROZEN',
      scientificProvenanceHash: 'd'.repeat(64),
    },
  ],
  unresolved: [{ executionId: 'e3', subjectUserId: 'u3', membershipId: 'm3', reason: 'NOT_COMPLETED' }],
})

describe('reporting Series/Wave identity', () => {
  it('normalizes Series scope without widening the resource domain', () => {
    expect(validateReportingSeriesScope({ schemaVersion: 1, resourceFamily: 'SCALE', resourceKey: ' wellbeing ' })).toEqual({
      schemaVersion: 1,
      resourceFamily: 'SCALE',
      resourceKey: 'wellbeing',
    })
    expect(() => validateReportingSeriesScope({ schemaVersion: 1, resourceFamily: 'FORM', resourceKey: 'x' })).toThrow()
  })

  it('freezes deterministic result associations independent of resolver order', () => {
    const original = batch()
    const reversed: ReportingResultBatchV1 = {
      ...original,
      resolved: [...original.resolved].reverse(),
      unresolved: [...original.unresolved].reverse(),
    }
    const first = buildReportingWaveInputManifest(original)
    const second = buildReportingWaveInputManifest(reversed)
    expect(first).toEqual(second)
    expect(first.resolved.map((item) => item.executionId)).toEqual(['e1', 'e2'])
    expect(reportingWaveInputIdentity({ cohortIdentityHash: '1'.repeat(64), manifest: first }))
      .toBe(reportingWaveInputIdentity({ cohortIdentityHash: '1'.repeat(64), manifest: second }))
  })

  it('changes Wave identity when execution-to-result association changes', () => {
    const first = buildReportingWaveInputManifest(batch())
    const swapped = batch()
    const [a, b] = swapped.resolved
    swapped.resolved = [
      { ...a, canonicalResultHash: b.canonicalResultHash },
      { ...b, canonicalResultHash: a.canonicalResultHash },
    ]
    const second = buildReportingWaveInputManifest(swapped)
    expect(reportingWaveInputIdentity({ cohortIdentityHash: '1'.repeat(64), manifest: first }))
      .not.toBe(reportingWaveInputIdentity({ cohortIdentityHash: '1'.repeat(64), manifest: second }))
  })
})
