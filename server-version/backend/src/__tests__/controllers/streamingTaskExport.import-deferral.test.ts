import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'

// Isolate workbook loading from unrelated database/storage initialization.
vi.mock('../../services/exportStorage', () => ({
  EXPORT_MAX_BYTES: 50 * 1024 * 1024,
  EXPORT_MAX_RECORDS: 10000,
  EXPORT_MAX_FIELDS: 2000,
}))

afterEach(() => {
  vi.doUnmock('exceljs')
  vi.resetModules()
})

describe('task export engine import deferral', () => {
  it('does not initialize ExcelJS on helper import, but loads it for a workbook request', async () => {
    vi.resetModules()
    const initialize = vi.fn()
    vi.doMock('exceljs', async importOriginal => {
      initialize()
      return await importOriginal<typeof import('exceljs')>()
    })
    const { writeSnapshotWorkbook } = await import('../../utils/streamingTaskExport')
    expect(initialize).not.toHaveBeenCalled()

    const dir = await mkdtemp(path.join(tmpdir(), 'stream-import-test-'))
    try {
      const input = path.join(dir, 'rows.ndjson')
      await writeFile(input, JSON.stringify({ value: 'synthetic' }) + '\n')
      let bytes = 0
      const sink = new Writable({ write(chunk, _encoding, callback) { bytes += chunk.length; callback() } })
      await writeSnapshotWorkbook(input, sink, 'deferred')
      expect(initialize).toHaveBeenCalledTimes(1)
      expect(bytes).toBeGreaterThan(0)
      expect(sink.writableFinished).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('destroys the destination when loading ExcelJS fails', async () => {
    vi.resetModules()
    const initialize = vi.fn(() => { throw new Error('synthetic ExcelJS load failure') })
    vi.doMock('exceljs', initialize)
    const { writeSnapshotWorkbook } = await import('../../utils/streamingTaskExport')
    expect(initialize).not.toHaveBeenCalled()
    const write = vi.fn()
    const sink = new Writable({ write(_chunk, _encoding, callback) { write(); callback() } })
    await expect(writeSnapshotWorkbook('unused.ndjson', sink, 'failure')).rejects.toThrow()
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(sink.destroyed).toBe(true)
    expect(write).not.toHaveBeenCalled()
  })
})
