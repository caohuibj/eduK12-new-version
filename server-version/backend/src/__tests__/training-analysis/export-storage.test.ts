import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ root: `/tmp/training-export-retention-${process.pid}-${Date.now()}` }))
vi.mock('../../services/exportArtifactService', () => ({ exportRoot: () => state.root,
  validateStorageKey: (key: string) => { if (key !== path.basename(key)) throw new Error('invalid path'); return path.join(state.root, key) } }))
import { cleanupExpiredExportArtifacts } from '../../services/exportStorage'
import { saveTrainingAnalysisExport } from '../../modules/training-analysis/export'
import { exportOptions, tables } from './export-fixtures'

const batchId = '60000000-0000-4000-8000-000000000001'
const key = `training_analysis_10000000_${batchId}__generation_1.csv`
const temporaryKey = `${key}.tmp-export-job`
const writeStale = (name: string) => {
  const file = path.join(state.root, name); fs.writeFileSync(file, 'synthetic export test')
  const old = new Date(Date.now() - 10 * 86400000); fs.utimesSync(file, old, old)
  return file
}
const db = (referenced: string[] = [], active: string[] = []) => ({
  exportArtifact: { findMany: vi.fn(async ({ where }: any) => where.storageKey ? referenced.map(storageKey => ({ storageKey })) : []), deleteMany: vi.fn() },
  exportBatch: { findMany: vi.fn(async ({ where }: any) => where.id ? active.map(id => ({ id })) : []), deleteMany: vi.fn() },
})
describe('Training files retain the original export retention and stale-generation cleanup', () => {
  beforeEach(() => { fs.rmSync(state.root, { recursive: true, force: true }); fs.mkdirSync(state.root, { recursive: true }) })
  afterAll(() => fs.rmSync(state.root, { recursive: true, force: true }))
  it('writes the real private temporary file under the original export root', async () => {
    const file = await saveTrainingAnalysisExport({ options: exportOptions(), tables: tables(), format: 'csv', batchId, generation: 2 })
    expect(file).toContain(`${state.root}/training_analysis_10000000_${batchId}__generation_2.csv.tmp-`)
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(fs.readFileSync(file, 'utf8')).toContain("'=HYPERLINK")
  })
  it('removes only stale unreferenced Training generation and temp files', async () => {
    const final = writeStale(key), temporary = writeStale(temporaryKey), unrelated = writeStale('unrelated.csv')
    expect((await cleanupExpiredExportArtifacts(db() as any)).deletedFiles).toBe(2)
    expect(fs.existsSync(final)).toBe(false); expect(fs.existsSync(temporary)).toBe(false); expect(fs.existsSync(unrelated)).toBe(true)
  })
  it('preserves referenced files and PROCESSING batch generations', async () => {
    const final = writeStale(key), temporary = writeStale(temporaryKey)
    expect((await cleanupExpiredExportArtifacts(db([key], [batchId]) as any)).deletedFiles).toBe(0)
    expect(fs.existsSync(final)).toBe(true); expect(fs.existsSync(temporary)).toBe(true)
  })
})
