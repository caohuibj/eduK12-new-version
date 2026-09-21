import { describe, expect, it } from 'vitest'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import { projectCompositeCollectionReport } from '../../modules/composite/composite-report.projector'

const restrictedPolicy = {
  disposition: 'FROZEN_V2' as const,
  disclosure: {
    schemaVersion: 1 as const,
    policyVersion: 'restricted-v1',
    audiences: {
      subject: DISCLOSURE_PRESETS.EDUCATIONAL_ONLY(),
      teacher: DISCLOSURE_PRESETS.FULL_REPORT(),
      researcher: DISCLOSURE_PRESETS.FULL_REPORT(),
    },
    unknownAudience: 'DENY' as const,
  },
  educationalFeedback: {
    schemaVersion: 1 as const,
    contentVersion: 'feedback-v1',
    blocks: [{ id: 'fixed', body: '固定教育反馈' }],
  },
  runtimePolicyHash: 'a'.repeat(64),
}

const scaleUnit = {
  itemId: 'scale-item',
  type: 'SCALE',
  kind: 'scale',
  scaleId: 'scale-1',
  scaleCode: 'synthetic_restricted',
  scaleName: 'Synthetic restricted',
  completedAt: '2026-09-21T00:00:00.000Z',
  totalTime: 10,
  scores: [{ key: 'secret', label: 'Secret score', value: 99 }],
  references: [{ secretPercentile: 99 }],
  interpretations: [{ scoreKey: 'secret', headline: 'HIGH', label: 'HIGH', interpretation: 'secret', guidance: [], limitations: [], referenceVersion: null }],
  quality: { status: 'interpretable', flags: [] },
  method: { instrumentVersion: '1.0.0' },
  result: null,
  __scaleProjectionPolicy: restrictedPolicy,
}

describe('Composite Scale disclosure wrapper', () => {
  it('does not let collection context promote participant Scale data to researcher fields', () => {
    const output = projectCompositeCollectionReport({
      id: 'report-1',
      unitReports: [scaleUnit],
      backgroundValues: [],
    }, 'participant')
    expect(output.unitReports[0]).toMatchObject({ reportKind: 'educational' })
    expect(JSON.stringify(output)).toContain('固定教育反馈')
    expect(JSON.stringify(output)).not.toContain('99')
    expect(JSON.stringify(output)).not.toContain('HIGH')
    expect(output).not.toHaveProperty('modules')
  })

  it('preserves teacher access when the instrument policy allows it', () => {
    const output = projectCompositeCollectionReport({
      id: 'report-1',
      unitReports: [scaleUnit],
      backgroundValues: [],
    }, 'teacher')
    expect(output.unitReports[0].scores).toEqual([{ key: 'secret', label: 'Secret score', value: 99 }])
  })
})
