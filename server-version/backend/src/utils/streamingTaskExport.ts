import ExcelJS from 'exceljs'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, open, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import type { Request, Response } from 'express'
import { EXPORT_MAX_BYTES, EXPORT_MAX_RECORDS, EXPORT_MAX_FIELDS } from '../services/exportStorage'
import type { Writable } from 'node:stream'
import type { ExcelRow } from './excelWorkbook'

export const EXPORT_BATCH_SIZE = 250
const MAX_ROWS = Math.min(EXPORT_MAX_RECORDS, 1048575)
let activeExport = false
export class TaskExportBusyError extends Error {}
export class TaskExportLimitError extends Error {}
export class TaskExportPermissionError extends Error {}
export class TaskExportAuthenticationError extends Error {}

// Reuse exactly the route's authentication policy (session expiry/revocation,
// token version, account state, current role/domain and administrator proof).
export async function refreshTaskExportAuthentication(req: Request, res: Response) {
  let authenticated = false
  let authenticationError: unknown
  const { authenticate, requireTeacher } = await import('../middleware/auth')
  await authenticate(req, res, (err?: unknown) => { if (err) authenticationError = err; else authenticated = true })
  if (authenticationError) throw authenticationError
  if (!authenticated) throw new TaskExportAuthenticationError('Authentication response already sent')
  let permitted = false
  requireTeacher(req, res, () => { permitted = true })
  if (!permitted) throw new TaskExportAuthenticationError('Authorization response already sent')
}

/** Spool a coherent DB snapshot first; never send a valid-looking partial workbook. */
export async function sendTaskExport(
  res: Response,
  filename: string | (() => string),
  sheetName: string,
  snapshot: (append: (rows: ExcelRow[]) => Promise<void>, checkConnected: () => void) => Promise<void>,
  authorizeDownload: () => Promise<void> = async () => {},
): Promise<void> {
  if (activeExport) throw new TaskExportBusyError('导出繁忙，请稍后重试')
  activeExport = true
  let dir: string | undefined
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(new Error('Export time limit exceeded')), 120_000)
  timer.unref()
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'training-export-'))
    const snapshotPath = path.join(dir, 'snapshot.ndjson')
    const workbookPath = path.join(dir, 'export.xlsx')
    let disconnected = false
    const onClose = () => { if (!res.writableFinished) { disconnected = true; abort.abort(new Error('Export client disconnected')) } }
    res.once('close', onClose)
    const checkConnected = () => {
      if (abort.signal.aborted) throw abort.signal.reason
      if (disconnected || res.destroyed) throw new Error('Export client disconnected')
    }
    try {
      const file = await open(snapshotPath, 'wx', 0o600)
      let bytes = 0
      let count = 0
      try {
        await snapshot(async rows => {
          checkConnected()
          for (const row of rows) {
            if (Object.keys(row).length > Math.min(EXPORT_MAX_FIELDS, 16384)) throw new TaskExportLimitError('导出字段数超过上限，请减少题目后重试')
            const line = JSON.stringify(row) + '\n'
            bytes += Buffer.byteLength(line)
            count += 1
            if (bytes > EXPORT_MAX_BYTES || count > MAX_ROWS) throw new TaskExportLimitError('导出超过条数或文件大小上限，请减少数据后重试')
            const buffer = Buffer.from(line)
            let offset = 0
            while (offset < buffer.length) {
              checkConnected()
              const { bytesWritten } = await file.write(buffer, offset, buffer.length - offset)
              if (!bytesWritten) throw new Error('Snapshot write made no progress')
              offset += bytesWritten
            }
          }
        }, checkConnected)
      } finally {
        await file.close()
      }
      checkConnected()
      await writeSnapshotWorkbook(snapshotPath, workbookPath, sheetName, checkConnected, abort.signal)
      checkConnected()
      await authorizeDownload()
      checkConnected()
      const { size } = await stat(workbookPath)
      if (size > EXPORT_MAX_BYTES) throw new TaskExportLimitError('导出超过条数或文件大小上限，请减少数据后重试')
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(typeof filename === 'function' ? filename() : filename)}"`)
      res.setHeader('Content-Length', size)
      await pipeline(createReadStream(workbookPath), res, { signal: abort.signal })
    } finally {
      res.off('close', onClose)
    }
  } finally {
    clearTimeout(timer)
    try { if (dir) await rm(dir, { recursive: true, force: true }) } finally { activeExport = false }
  }
}

/** ExcelJS 4.4's batch StreamBuf does not propagate ZIP backpressure.
 * Isolate its version-specific adapter: non-batch writes await the ZIP consumer,
 * and callers wait for every row before reading another line. Fail closed if
 * the installed implementation changes rather than silently buffering a sheet.
 */
async function rowWriter(worksheet: ExcelJS.Worksheet, checkConnected: () => void, guard: <T>(work: Promise<T>) => Promise<T>) {
  if (require('exceljs/package.json').version !== '4.4.0') throw new Error('Unsupported ExcelJS version')
  const stream = (worksheet as unknown as { stream: {
    batch: boolean; pipes: unknown[]; buffers: unknown[]; _pipe: (chunk: unknown) => Promise<void>; write: (...args: any[]) => Promise<boolean>
  } }).stream
  if (!stream || !Array.isArray(stream.pipes) || !Array.isArray(stream.buffers) || typeof stream._pipe !== 'function' || typeof stream.batch !== 'boolean') {
    throw new Error('Unsupported ExcelJS streaming implementation')
  }
  while (!stream.pipes.length) {
    checkConnected()
    await guard(yieldTurn())
  }
  // The paused worksheet has a buffered XML preamble. Drain it before switching
  // modes, or the preamble would be appended after rows at end().
  while (stream.buffers.length) await guard(stream._pipe(stream.buffers.shift()))
  stream.batch = false
  const original = stream.write.bind(stream)
  let pending: Promise<boolean>[] = []
  stream.write = (...args: any[]) => {
    const promise = original(...args)
    void promise.catch(() => {})
    pending.push(promise)
    return promise
  }
  const flush = async () => { await guard(Promise.all(pending)); pending = [] }
  const write = async (row: ExcelRow) => {
    checkConnected()
    const safe: ExcelRow = {}
    for (const [key, value] of Object.entries(row)) {
      safe[key] = typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : value
    }
    worksheet.addRow(safe).commit()
    await flush()
  }
  return { write, flush }
}

export async function writeSnapshotWorkbook(input: string, output: string | Writable, name: string, checkConnected = () => {}, signal?: AbortSignal) {
  const destination = typeof output === 'string' ? createWriteStream(output, { flags: 'wx', mode: 0o600 }) : output
  // Observe failures immediately, including errors before workbook.commit installs listeners.
  let rejectFailure!: (err: Error) => void
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject })
  void failure.catch(() => {})
  const fail = (err: Error) => rejectFailure(err)
  const onAbort = () => fail(signal?.reason || new Error('Export aborted'))
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()
  destination.on('error', fail)
  const guard = <T>(work: Promise<T>) => Promise.race([work, failure])
  let zip: { on: (event: string, listener: (err: Error) => void) => void; abort: () => void } | undefined
  let source: ReturnType<typeof createReadStream> | undefined
  let lines: ReturnType<typeof createInterface> | undefined
  try {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: destination, useSharedStrings: false, useStyles: true })
    zip = (workbook as unknown as { zip: NonNullable<typeof zip> }).zip
    zip.on('error', fail)
    const worksheet = workbook.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
    source = createReadStream(input)
    source.on('error', fail)
    lines = createInterface({ input: source, crlfDelay: Infinity })
    const writeRow = await rowWriter(worksheet, checkConnected, guard)
    let initialized = false
    const iterator = lines[Symbol.asyncIterator]()
    while (true) {
      const next = await guard(iterator.next())
      if (next.done) break
      const row: ExcelRow = JSON.parse(next.value)
      if (!initialized) {
        worksheet.columns = Object.keys(row).map(header => ({ header, key: header, width: Math.min(80, Math.max(12, header.length + 2)) }))
        worksheet.getRow(1).font = { bold: true }
        initialized = true
      }
      await writeRow.write(row)
    }
    worksheet.commit()
    await writeRow.flush()
    await guard(workbook.commit())
  } catch (err) {
    // Stop ZIP work before unlinking its private temporary output.
    zip?.abort()
    destination.destroy()
    throw err
  } finally {
    signal?.removeEventListener('abort', onAbort)
    lines?.close()
    source?.destroy()
  }
}
