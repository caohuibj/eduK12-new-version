import { describe, expect, it } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'

describe('data-only source discovery', () => {
  it('discovers a new instrument directory and preserves its DRAFT release in every registry', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'scale-source-discovery-'))
    try {
      cpSync(resolve('src'), join(workspace, 'src'), { recursive: true })
      mkdirSync(join(workspace, 'scripts'))
      cpSync(resolve('scripts/generate-scale-instruments.ts'), join(workspace, 'scripts/generate-scale-instruments.ts'))
      symlinkSync(realpathSync(resolve('node_modules')), join(workspace, 'node_modules'), 'dir')
      const source = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!)
      source.identity = { instrumentKey: 'synthetic_data_only', instrumentVersion: '1.0.0' }
      source.executable!.releaseStatus = 'DRAFT'
      const dir = join(workspace, 'src/modules/scale/instruments/synthetic_data_only/1.0.0')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'instrument.ts'), `export const SCALE_INSTRUMENT_SOURCE = ${JSON.stringify(source)} satisfies import('../../../onboarding/types').ScaleInstrumentSourceV1`)
      const cli = realpathSync(resolve('node_modules/.bin/tsx'))
      const run = (file: string, ...args: string[]) => {
        const child = spawnSync(process.execPath, [cli, file, ...args], { cwd: workspace, encoding: 'utf8' })
        expect(child.status, child.stderr + child.stdout).toBe(0)
      }
      run('scripts/generate-scale-instruments.ts')
      run('scripts/generate-scale-instruments.ts', '--check')
      expect(readFileSync(join(workspace, 'src/modules/scale/onboarding/instruments.generated.ts'), 'utf8')).toContain('../instruments/synthetic_data_only/1.0.0/instrument')
      writeFileSync(join(workspace, 'verify.ts'), `
import assert from 'node:assert/strict'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } from './src/modules/scale/onboarding/instrument-registry'
import { getScalePackage } from './src/modules/scale/scale-package.registry'
import { buildScaleLibraryReadModel } from './src/modules/scale/library/scale-library-read-model'
assert.ok(getScaleInstrumentSource('synthetic_data_only', '1.0.0'))
assert.ok(getScaleInstrumentRuntimePolicy('synthetic_data_only', '1.0.0'))
assert.equal(getScalePackage('synthetic_data_only', '1.0.0')?.releaseStatus, 'DRAFT')
assert.ok(buildScaleLibraryReadModel().entries.some(entry => entry.identity.instrumentKey === 'synthetic_data_only'))
`)
      run('verify.ts')
    } finally { rmSync(workspace, { recursive: true, force: true }) }
  }, 30000)
})
