import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { batchManifestSchema, loadPinnedSource, requireDisposableBatchUrl, sha256, validateBatchEntry } from '../../../scripts/scale-content-batch'

const key = 'cfsr12_zh_cn_research'
const raw = readFileSync(resolve('src/modules/scale/instruments', key, '1.0.1/source.json'))
const entry = { instrumentKey: key, instrumentVersion: '1.0.1', sourceSha256: sha256(raw) }
describe('explicit content batch safety and actual report consumer', () => {
  it('refuses duplicate identities and two versions of one scale code', () => {
    for (const sources of [[entry, entry], [entry, {...entry, instrumentVersion:'1.0.0'}]]) {
      expect(() => batchManifestSchema.parse({schemaVersion:1,batchId:'test-batch',sources})).toThrow()
    }
  })
  it('refuses source traversal and byte drift', () => {
    expect(() => loadPinnedSource(process.cwd(), {...entry, instrumentKey:'../other'})).toThrow()
    expect(() => loadPinnedSource(process.cwd(), {...entry, sourceSha256:'0'.repeat(64)})).toThrow('SOURCE_HASH_MISMATCH')
  })
  it('never falls back to an application or production database', () => {
    for (const url of [undefined, 'postgresql://app:test@example.com/eduk12_scales_test',
      'postgresql://app:test@localhost/eduk12_dev', 'postgresql://app:test@localhost/eduk12_scales_test?schema=private',
      'postgresql://app:test@localhost/eduk12_scales_test?host=elsewhere', 'file:///eduk12_scales_test']) {
      expect(() => requireDisposableBatchUrl(url)).toThrow()
    }
    expect(requireDisposableBatchUrl('postgresql://app:test@127.0.0.1:55439/eduk12_scales_test?schema=public')).toContain('127.0.0.1')
  })
  it('captures real versioned reports and does not invent parameter version', () => {
    const output = validateBatchEntry(process.cwd(), entry)
    expect(output.identity.instrumentVersion).toBe('1.0.1')
    expect(output.independentParameterVersion).toBeNull()
    expect(output.parameterPolicy).toEqual({type:'none'})
    expect(output.samples.find(s=>s.name==='minimum')!.result.scores.map(s=>s.value)).toEqual([0,0,0])
    expect(output.samples.find(s=>s.name==='maximum')!.result.scores.map(s=>s.value)).toEqual([12,12,12])
    expect(output.samples.find(s=>s.name==='one_missing')!.result.interpretations).toEqual([])
    expect(output.samples.every(s=>s.result.method.reportVersion===output.reportVersion)).toBe(true)
  })
  it('does not overwrite an earlier execution receipt', () => {
    const out = mkdtempSync(join(tmpdir(), 'scale-batch-receipt-'))
    try {
      const previous = '{"batchId":"prior-failed-run"}\n'
      writeFileSync(join(out, 'receipt.json'), previous)
      const manifest = join(out, 'manifest.json')
      writeFileSync(manifest, JSON.stringify({ schemaVersion:1, batchId:'test-receipt', sources:[entry] }))
      const child = spawnSync(process.execPath, [
        resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/scale-content-batch.ts'),
        '--manifest',manifest,'--out',out,
      ], { encoding:'utf8' })
      expect(child.status).toBe(1)
      expect(child.stderr).toContain('OUTPUT_ALREADY_USED_CHOOSE_NEW_DIRECTORY')
      expect(readFileSync(join(out, 'receipt.json'), 'utf8')).toBe(previous)
    } finally { rmSync(out, {recursive:true,force:true}) }
  })

})
