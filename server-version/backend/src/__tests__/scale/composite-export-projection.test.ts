import { describe, expect, it } from 'vitest'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import {
  bindCompositeExportFileName,
  compositeExportFileNameMatchesProjection,
  projectCompositeExportData,
  type CompositeExportProjectionBindingV1,
} from '../../modules/composite/composite-export-projection'

const binding = (capabilities = DISCLOSURE_PRESETS.FULL_REPORT(), fingerprint = 'a'.repeat(64)): CompositeExportProjectionBindingV1 => ({
  projectionVersion: 'composite-scale-export-projection-v1',
  resourceType: 'COMPOSITE',
  resourceId: 'composite-12345678',
  audience: 'teacher',
  scales: [{
    prefix: 'S001_',
    itemId: 'item-scale-1',
    scaleId: 'scale-1',
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    policyDisposition: 'LEGACY_PROFILE',
    policyVersion: 'legacy-test-v1',
    capabilities,
  }],
  fingerprint,
})

const data = {
  assessmentId: 'composite-12345678',
  assessmentName: 'Composite',
  detail: 'full' as const,
  fields: [
    { name: 'U_id', label: 'Participant', type: 'string' as const },
    { name: 'S001_scale_id', label: 'Scale', type: 'string' as const },
    { name: 'S001_Q_V_i1', label: 'Raw answer', type: 'string' as const },
    { name: 'S001_Q_S_i1', label: 'Item score', type: 'numeric' as const },
    { name: 'S001_RT_i1', label: 'RT', type: 'numeric' as const },
    { name: 'S001_SCORE_total', label: 'Score', type: 'numeric' as const },
    { name: 'S001_quality_status', label: 'Quality', type: 'string' as const },
    { name: 'S001_reference_versions', label: 'References', type: 'string' as const },
    { name: 'S001_definition_hash', label: 'Method', type: 'string' as const },
    { name: 'S001_device_class', label: 'Device', type: 'string' as const },
    { name: 'S001_future_secret', label: 'Future internal field', type: 'string' as const },
    { name: 'C002_score', label: 'Cognitive score', type: 'numeric' as const },
  ],
  rows: [{
    U_id: 'u1',
    S001_scale_id: 'scale-1',
    S001_Q_V_i1: 'RAW_SECRET',
    S001_Q_S_i1: 2,
    S001_RT_i1: 500,
    S001_SCORE_total: 10,
    S001_quality_status: 'interpretable',
    S001_reference_versions: 'ref-1',
    S001_definition_hash: 'hash',
    S001_device_class: 'MOBILE',
    S001_future_secret: 'DO_NOT_LEAK',
    C002_score: 3,
  }],
  trialCount: 0,
}

describe('Composite wide Scale export projection', () => {
  it('keeps FULL_REPORT item scores but removes raw answers and device provenance', () => {
    const projected = projectCompositeExportData(data, binding())
    const names = projected.fields.map((field) => field.name)
    expect(names).toContain('S001_Q_S_i1')
    expect(names).toContain('S001_SCORE_total')
    expect(names).toContain('S001_quality_status')
    expect(names).toContain('S001_reference_versions')
    expect(names).toContain('S001_definition_hash')
    expect(names).toContain('C002_score')
    expect(names).not.toContain('S001_Q_V_i1')
    expect(names).not.toContain('S001_RT_i1')
    expect(names).not.toContain('S001_device_class')
    expect(names).not.toContain('S001_future_secret')
    expect(JSON.stringify(projected.rows)).not.toMatch(/RAW_SECRET|DO_NOT_LEAK|MOBILE/)
  })

  it('reduces EDUCATIONAL_ONLY Scale columns to non-result identity fields', () => {
    const projected = projectCompositeExportData(data, binding(DISCLOSURE_PRESETS.EDUCATIONAL_ONLY()))
    expect(projected.fields.map((field) => field.name)).toEqual([
      'U_id',
      'S001_scale_id',
      'C002_score',
    ])
    expect(projected.rows[0]).toEqual({ U_id: 'u1', S001_scale_id: 'scale-1', C002_score: 3 })
  })

  it('binds artifacts to audience and policy fingerprint and rejects old/stale names', () => {
    const legacy = 'composite_12345678_full_2026-09-21T03-00-00_00000000-0000-0000-0000-000000000000.csv'
    const current = binding()
    const bound = bindCompositeExportFileName(legacy, current, 'abcdef0')
    expect(compositeExportFileNameMatchesProjection(bound, current)).toBe(true)
    expect(compositeExportFileNameMatchesProjection(legacy, current)).toBe(false)
    expect(compositeExportFileNameMatchesProjection(bound, binding(DISCLOSURE_PRESETS.FULL_REPORT(), 'b'.repeat(64)))).toBe(false)
  })
})
