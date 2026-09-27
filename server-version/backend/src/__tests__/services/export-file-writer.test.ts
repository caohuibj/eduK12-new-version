import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeExportDataFile } from '../../services/exportService.legacy'

const dirs: string[] = []

const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-writer-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('bounded export file writer', () => {
  it('writes CSV incrementally within the configured byte ceiling', async () => {
    const file = path.join(tmp(), 'sample.csv')
    await writeExportDataFile(file, {
      fields: [
        { name: 'U_id', label: 'ID', type: 'string' },
        { name: 'score', label: 'Score', type: 'numeric' },
      ],
      rows: Array.from({ length: 50 }, (_, index) => ({ U_id: `U${index}`, score: index })),
    }, 'csv', 10_000)

    const body = fs.readFileSync(file, 'utf8')
    expect(body).toContain('U_id,score')
    expect(body).toContain('"U49",49')
  })

  it('removes a partial CSV when the byte ceiling is crossed', async () => {
    const file = path.join(tmp(), 'too-large.csv')
    await expect(writeExportDataFile(file, {
      fields: [{ name: 'U_id', label: 'ID', type: 'string' }],
      rows: [{ U_id: 'x'.repeat(1024) }],
    }, 'csv', 64)).rejects.toThrow(/EXPORT_MAX_BYTES/)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('writes SPS syntax without serializing row payloads', async () => {
    const file = path.join(tmp(), 'sample.sps')
    await writeExportDataFile(file, {
      fields: [{ name: 'score', label: 'Score', type: 'numeric' }],
      rows: [{ score: 123456789 }],
    }, 'sps', 10_000)
    const body = fs.readFileSync(file, 'utf8')
    expect(body).toContain('GET DATA')
    expect(body).not.toContain('123456789')
  })
})
