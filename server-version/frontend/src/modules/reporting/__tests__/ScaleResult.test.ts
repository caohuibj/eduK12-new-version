import { describe, expect, it } from 'vitest'
import { toScaleUnitReport } from '../../../pages/student/ScaleResult'
import type { ScaleResultV2 } from '../types'

describe('standalone ScaleResult unit-report adapter', () => {
  it('preserves scale code, method provenance, and an explicitly empty disclaimer', () => {
    const result: ScaleResultV2 = {
      schemaVersion: 2,
      instrument: { scaleId: 'scale-1', code: 'S-1', name: '注意量表', instrumentVersion: '2.0.0' },
      method: {
        scaleId: 'scale-1',
        instrumentVersion: '2.0.0',
        scoringVersion: '2.0.0',
        reportVersion: '2.0.0',
        definitionHash: 'hash-1',
        referenceVersions: [],
      },
      quality: { status: 'interpretable', flags: [] },
      itemScores: [],
      scores: [],
      references: [],
      interpretations: [],
      caveats: [],
      disclaimer: '',
    }
    const report = toScaleUnitReport({
      id: 'assessment-1',
      status: 'COMPLETED',
      result,
      startedAt: '2026-08-24T00:00:00.000Z',
      completedAt: '2026-08-24T00:01:00.000Z',
      totalTime: 60_000,
      scale: {
        id: 'scale-1',
        code: 'S-1',
        name: '注意量表',
        description: null,
      },
    })

    expect(report.scaleCode).toBe('S-1')
    expect(report.method).toEqual(result.method)
    expect(report.disclaimer).toBe('')
    expect(report.result?.schemaVersion).toBe(2)
  })
})
