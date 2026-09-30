import { describe, it, expect } from 'vitest'
import { projectParticipantLongitudinal } from '../../modules/reporting/participantProjection'
import type { ReportingIndividualProjectionV1 } from '../../modules/reporting/types'

describe('participant longitudinal allowlist', () => {
  it('omits researcher fields, hidden metrics and forbidden differences', () => {
    const projection: ReportingIndividualProjectionV1 = {
      schemaVersion: 1, kind: 'INDIVIDUAL_LONGITUDINAL', state: 'present',
      waves: [{ waveId: 'private-wave', waveKey: 'researcher-note', ordinal: 1, metrics: { visible: { state: 'present', value: 5 }, secret: { state: 'present', value: 9 } }, evidence: { level: 'PILOT', limitations: ['private-evidence'] } }],
      comparisons: [{ fromWaveId: 'private-wave', toWaveId: 'private-wave', metrics: { visible: { delta: 99, comparability: { schemaVersion: 1, metricId: 'visible', level: 'NOT_COMPARABLE', allowedOperations: ['SIDE_BY_SIDE'], evidenceHash: 'secret-hash', evidenceRef: 'secret-ref', limitations: [] } } } }],
      limitations: ['private-note'],
    }
    const dto = projectParticipantLongitudinal(projection, ['visible'])
    expect(dto.waves[0].metrics).toEqual({ visible: { state: 'present', value: 5 } })
    expect(dto.comparisons[0].metrics.visible).toEqual({ comparability: 'NOT_COMPARABLE' })
    expect(JSON.stringify(dto)).not.toMatch(/private|secret|researcher|evidenceHash|evidenceRef|waveId/)
    expect(projection.comparisons[0].metrics.visible.delta).toBe(99)
  })
})
