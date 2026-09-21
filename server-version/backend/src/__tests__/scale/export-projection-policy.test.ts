import { describe, expect, it } from 'vitest'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import {
  bindExportStorageKey,
  projectExportData,
  projectionBindingFromStorageKey,
  storageKeyMatchesProjection,
  type ExportProjectionBindingV1,
} from '../../services/exportProjectionPolicy'

const binding = (caps = DISCLOSURE_PRESETS.EDUCATIONAL_ONLY()): ExportProjectionBindingV1 => ({
  projectionVersion: 'scale-export-projection-v1',
  resourceType: 'SCALE',
  resourceId: 'scale-1',
  audience: 'respondent',
  scales: [{
    scaleId: 'scale-1',
    instrumentKey: 'synthetic',
    instrumentVersion: '1.0.0',
    policyDisposition: 'FROZEN_V2',
    policyVersion: 'policy-v1',
    capabilities: caps,
  }],
  fingerprint: 'a'.repeat(64),
})

const data = {
  fields: [
    { name: 'U_id', label: '用户', type: 'string' as const },
    { name: 'Q_V_item', label: '原始回答', type: 'string' as const },
    { name: 'Q_S_item', label: '题目分值', type: 'numeric' as const },
    { name: 'RT_item', label: '响应时间', type: 'numeric' as const },
    { name: 'SCORE_total', label: '总分', type: 'numeric' as const },
    { name: 'QUALITY_STATUS', label: '质量', type: 'string' as const },
    { name: 'INSTRUMENT_VERSION', label: '版本', type: 'string' as const },
    { name: 'REFERENCE_VERSIONS', label: '参考', type: 'string' as const },
  ],
  rows: [{ U_id: 'U1', Q_V_item: 'x', Q_S_item: 1, RT_item: 100, SCORE_total: 9, QUALITY_STATUS: 'interpretable', INSTRUMENT_VERSION: '1', REFERENCE_VERSIONS: 'r1' }],
}

describe('export projection policy', () => {
  it('keeps completion identity but strips all score/raw/method fields for EDUCATIONAL_ONLY', () => {
    const projected = projectExportData(data, binding())
    expect(projected.fields.map((field) => field.name)).toEqual(['U_id'])
    expect(projected.rows).toEqual([{ U_id: 'U1' }])
  })

  it('treats raw answers as a capability separate from FULL_REPORT', () => {
    const projected = projectExportData(data, binding(DISCLOSURE_PRESETS.FULL_REPORT()))
    const names = projected.fields.map((field) => field.name)
    expect(names).toContain('SCORE_total')
    expect(names).toContain('Q_S_item')
    expect(names).not.toContain('Q_V_item')
    expect(names).not.toContain('RT_item')
  })

  it('persists audience scope in the storage key and rejects cross-audience artifact reuse', () => {
    const teacher = {
      ...binding(DISCLOSURE_PRESETS.FULL_REPORT()),
      audience: 'teacher' as const,
      fingerprint: 'b'.repeat(64),
    }
    const storageKey = bindExportStorageKey('scale_export.csv', teacher)
    expect(projectionBindingFromStorageKey(storageKey)).toEqual({
      audience: 'teacher',
      fingerprintPrefix: 'b'.repeat(24),
    })
    expect(storageKeyMatchesProjection(storageKey, teacher)).toBe(true)
    expect(storageKeyMatchesProjection(storageKey, { ...teacher, audience: 'researcher' })).toBe(false)
    expect(projectionBindingFromStorageKey('legacy_export.csv')).toBeNull()
  })
})
