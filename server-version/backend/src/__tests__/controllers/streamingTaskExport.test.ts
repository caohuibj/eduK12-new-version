import { describe, expect, it, vi } from 'vitest'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import ExcelJS from 'exceljs'
import { sendTaskExport, TaskExportBusyError, TaskExportLimitError, writeSnapshotWorkbook } from '../../utils/streamingTaskExport'

const createdDirectories = vi.hoisted(() => [] as string[])
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, mkdtemp: async (prefix: string) => {
    const dir = await actual.mkdtemp(prefix)
    if (prefix.includes('training-export-')) createdDirectories.push(dir)
    return dir
  } }
})

const response = (fail = false) => {
  const chunks: Buffer[] = []
  const res: any = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(fail ? new Error('synthetic download failure') : undefined) } })
  res.setHeader = vi.fn()
  res.chunks = chunks
  return res
}
const tempExports = async () => (await Promise.all(createdDirectories.map(async dir => { try { await access(dir); return dir } catch { return null } }))).filter(Boolean).sort()

describe('bounded task XLSX delivery', () => {
  it('generates complete output before headers and cleans its private files', async () => {
    const before = await tempExports()
    const res = response()
    await sendTaskExport(res, 'synthetic.xlsx', '合成', async append => {
      expect(res.setHeader).not.toHaveBeenCalled()
      await append([{ 序号: 1, 名称: '=not-formula' }, { 序号: 2, 名称: '@name' }])
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.concat(res.chunks))
    expect(workbook.worksheets[0].getCell('B2').value).toBe("'=not-formula")
    expect(workbook.worksheets[0].getCell('B3').value).toBe("'@name")
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', Buffer.concat(res.chunks).length)
    expect(await tempExports()).toEqual(before)
  })

  it('rejects a concurrent export without queuing or creating another snapshot', async () => {
    let release!: () => void
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const pending = sendTaskExport(response(), 'a.xlsx', 'a', async append => {
      started()
      await new Promise<void>(resolve => { release = resolve })
      await append([{ a: 'a' }])
    })
    await ready
    const snapshot = vi.fn()
    await expect(sendTaskExport(response(), 'b.xlsx', 'b', snapshot)).rejects.toBeInstanceOf(TaskExportBusyError)
    expect(snapshot).not.toHaveBeenCalled()
    release()
    await pending
  })

  it.each(['snapshot', 'limit', 'download', 'disconnect'])('cleans resources on %s failure without premature headers', async kind => {
    const before = await tempExports()
    const res = response(kind === 'download')
    const pending = sendTaskExport(res, 'failure.xlsx', 'failure', async (append, check) => {
      if (kind === 'snapshot') throw new Error('synthetic snapshot timeout')
      if (kind === 'disconnect') { res.destroy(); await new Promise(resolve => setImmediate(resolve)); check() }
      await append(kind === 'limit' ? Array.from({ length: 10001 }, () => ({ a: 'x' })) : [{ a: 'x' }])
    })
    if (kind === 'limit') await expect(pending).rejects.toBeInstanceOf(TaskExportLimitError)
    else await expect(pending).rejects.toThrow()
    if (kind !== 'download') expect(res.setHeader).not.toHaveBeenCalled()
    expect(await tempExports()).toEqual(before)
  })

  it('round-trips 3000 unique rows through an intentionally slow small-buffer sink', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'stream-test-'))
    try {
      const input = path.join(dir, 'rows.ndjson')
      await writeFile(input, Array.from({ length: 3000 }, (_, i) => JSON.stringify({ index: i, text: `unique-${i}-${'x'.repeat(100)}` }) + '\n').join(''))
      const chunks: Buffer[] = []
      const sink = new Writable({ highWaterMark: 32, write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); setTimeout(callback, 1) } })
      await writeSnapshotWorkbook(input, sink, 'slow')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(Buffer.concat(chunks))
      expect(workbook.worksheets[0].rowCount).toBe(3001)
      expect(workbook.worksheets[0].getCell('A3001').value).toBe(2999)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('rejects source/sink failures and cancels stalled output instead of hanging', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'stream-test-'))
    try {
      const input = path.join(dir, 'rows.ndjson')
      await writeFile(input, JSON.stringify({ a: 'x' }) + '\n')
      await expect(writeSnapshotWorkbook(path.join(dir, 'absent'), new PassThrough(), 'missing')).rejects.toThrow()
      const failed = new Writable({ write(_chunk, _encoding, callback) { callback(new Error('synthetic disk full')) } })
      await expect(writeSnapshotWorkbook(input, failed, 'fail')).rejects.toThrow('synthetic disk full')
      const stalled = new Writable({ highWaterMark: 1, write() {} })
      const abort = new AbortController()
      const pending = writeSnapshotWorkbook(input, stalled, 'cancel', () => {}, abort.signal)
      setTimeout(() => abort.abort(new Error('synthetic deadline')), 20)
      await expect(pending).rejects.toThrow('synthetic deadline')
      expect(stalled.destroyed).toBe(true)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

it('stops the row producer when ZIP output stalls instead of queuing the entire sheet', async () => {
  const { randomBytes } = await import('node:crypto')
  const WorksheetWriter = require('exceljs/lib/stream/xlsx/worksheet-writer')
  const rows = vi.spyOn(WorksheetWriter.prototype, 'addRow')
  const dir = await mkdtemp(path.join(tmpdir(), 'stream-test-'))
  const abort = new AbortController()
  let bytes = 0
  let maxQueued = 0
  let stalled!: () => void
  const didStall = new Promise<void>(resolve => { stalled = resolve })
  const sink = new Writable({ highWaterMark: 64, write(chunk, _encoding, callback) {
    bytes += chunk.length
    maxQueued = Math.max(maxQueued, sink.writableLength)
    if (bytes > 30000) stalled()
    else callback()
  } })
  try {
    const input = path.join(dir, 'rows.ndjson')
    await writeFile(input, Array.from({ length: 2000 }, (_, index) => JSON.stringify({ index, text: randomBytes(2048).toString('hex') }) + '\n').join(''))
    const pending = writeSnapshotWorkbook(input, sink, 'bounded', () => {}, abort.signal)
    const rejection = expect(pending).rejects.toThrow('synthetic stop')
    await didStall
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(rows.mock.calls.length).toBeLessThan(300)
    expect(maxQueued).toBeLessThanOrEqual(128 * 1024)
    abort.abort(new Error('synthetic stop'))
    await rejection
  } finally {
    abort.abort(new Error('synthetic stop'))
    rows.mockRestore()
    await rm(dir, { recursive: true, force: true })
  }
})

it('rejects an over-wide row at the existing fields limit before workbook headers and cleans up', async () => {
  const before = await tempExports()
  const res = response()
  await expect(sendTaskExport(res, 'wide.xlsx', 'wide', async append => {
    await append([Object.fromEntries(Array.from({ length: 2001 }, (_, index) => [`column${index}`, 'x']))])
  })).rejects.toBeInstanceOf(TaskExportLimitError)
  expect(res.setHeader).not.toHaveBeenCalled()
  expect(res.chunks).toHaveLength(0)
  expect(await tempExports()).toEqual(before)
})
