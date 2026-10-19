import { describe, expect, it } from 'vitest'
import { trainingAnalysisExportOptionsSchema, trainingAnalysisProvenanceSchema, trainingAnalysisExportBytes } from '../../modules/training-analysis/export'
import { exportOptions, tables, actor } from './export-fixtures'

function unzipStore(bytes: Buffer): Record<string, string> {
  const entries: Record<string, string> = {}
  let offset = 0
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28)
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const start = offset + 30 + nameLength + extraLength
    entries[name] = bytes.subarray(start, start + size).toString('utf8')
    offset = start + size
  }
  return entries
}

describe('Training export materialization and versioned provenance', () => {
  it('accepts only a strict server manifest and rejects changed selector or corrupted digest', () => {
    const options = exportOptions()
    expect(trainingAnalysisExportOptionsSchema.parse(options)).toEqual(options)
    expect(trainingAnalysisExportOptionsSchema.safeParse({ ...options, clientSelectedIds: [] }).success).toBe(false)
    expect(trainingAnalysisExportOptionsSchema.safeParse({ ...options, manifest: { ...options.manifest, authorityHash: 'a'.repeat(64) } }).success).toBe(false)
    expect(trainingAnalysisExportOptionsSchema.safeParse({ ...options, selector: { ...options.selector, mode: 'FULL_CASE' } }).success).toBe(false)
  })
  it('uses version 2 only for Training without accepting legacy attempt-only provenance', () => {
    const provenance = { version: 2, resourceType: 'TRAINING_ANALYSIS', generation: '60000000-0000-4000-8000-000000000001',
      creatorRole: actor.role, audience: 'teacher', trainingAnalysis: exportOptions() }
    expect(trainingAnalysisProvenanceSchema.parse(provenance)).toEqual(provenance)
    expect(trainingAnalysisProvenanceSchema.safeParse({ ...provenance, version: 1 }).success).toBe(false)
    expect(trainingAnalysisProvenanceSchema.safeParse({ ...provenance, attemptIds: [] }).success).toBe(false)
  })
  it('selects exactly the requested CSV table and protects spreadsheet formula cells', () => {
    const options = exportOptions()
    const csv = trainingAnalysisExportBytes({ options, tables: tables(), format: 'csv' }).toString('utf8')
    expect(csv).toContain('"participant","value","reason"')
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).not.toContain('wave1')
    const codebook = trainingAnalysisExportBytes({ options: { ...options, table: 'dictionary' }, tables: tables(), format: 'csv' }).toString('utf8')
    expect(codebook).toContain('"column","meaning"')
    expect(codebook).not.toContain('HYPERLINK')
  })
  it('packages all three frozen tables with a safe digest summary, without internal source identities', () => {
    const options = exportOptions()
    const files = unzipStore(trainingAnalysisExportBytes({ options, tables: tables(), format: 'zip' }))
    expect(Object.keys(files)).toEqual(['long.csv', 'wide.csv', 'dictionary.csv', 'manifest.json', 'README.txt'])
    const summary = JSON.parse(files['manifest.json'])
    expect(summary.manifestHash).toBe(options.manifest.manifestHash)
    expect(summary.sourceCutoff).toBe(options.manifest.sourceCutoff)
    expect(files['manifest.json']).not.toContain(actor.id)
    expect(files['manifest.json']).not.toContain(options.manifest.sources[0].attemptId)
    expect(files['manifest.json']).not.toContain('authorityHash')
    expect(files['manifest.json']).not.toContain('sourceHashes')
  })
  it('retains original export bounds and rejects unsupported writers', () => {
    const data = tables(); data.long.rows = Array.from({ length: 10001 }, () => ({ participant: 'P', value: 1, reason: null }))
    expect(() => trainingAnalysisExportBytes({ options: exportOptions(), tables: data, format: 'csv' })).toThrow(/上限/)
    expect(() => trainingAnalysisExportBytes({ options: exportOptions(), tables: tables(), format: 'sav' })).toThrow(/Unsupported/)
  })
})
