import { describe, expect, it } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
const url = integrationDatabaseUrl('SCALE_CLOSEOUT_INTEGRATION_DATABASE_URL', 'INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL')
;(url ? describe : describe.skip)('unknown source to published FINAL through real generated registry', () => {
  it('supports two new instrument-owned packages without registry mocks or DB publication writes', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'scale-closeout-'))
    const keys = [0, 1].map(index => `unknown_scale_${index}_${randomUUID().replaceAll('-', '')}`)
    try {
      cpSync(resolve('src'), join(workspace, 'src'), { recursive: true })
      cpSync(resolve('scripts'), join(workspace, 'scripts'), { recursive: true })
      symlinkSync(realpathSync(resolve('node_modules')), join(workspace, 'node_modules'), 'dir')
      keys.forEach((key, index) => {
        const source = structuredClone(getScaleInstrumentSource('who5', '1.0.0')!)
        source.identity = { instrumentKey: key, instrumentVersion: '1.0.0' }
        source.catalog.identity.canonicalName = `Synthetic ${index}`
        source.applicability = { schemaVersion: 1, policyVersion: '1', respondentTypes: ['SELF'], subject: { ageMonths: { minInclusive: index === 0 ? 168 : 720 } }, requiredContextKeys: [] }
        source.disclosure!.audiences.respondent = index === 0 ? DISCLOSURE_PRESETS.EDUCATIONAL_ONLY() : DISCLOSURE_PRESETS.FULL_REPORT()
        source.educationalFeedback = { schemaVersion: 1, contentVersion: '1', blocks: [{ id: 'help', body: 'Synthetic educational feedback independent of score.' }] }
        const dir = join(workspace, 'src/modules/scale/instruments', key, '1.0.0'); mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'instrument.ts'), `export const SCALE_INSTRUMENT_SOURCE = ${JSON.stringify(source)} satisfies import('../../../onboarding/types').ScaleInstrumentSourceV1`)
      })
      const cli = realpathSync(resolve('node_modules/.bin/tsx'))
      const run = (script: string, ...args: string[]) => {
        const result = spawnSync(process.execPath, [cli, script, ...args], { cwd: workspace, encoding: 'utf8', timeout: 90000, env: { ...process.env, DATABASE_URL: url!, DATA_ENCRYPTION_KEY: 'b'.repeat(64), DATA_PSEUDONYM_KEY: 'c'.repeat(64) } })
        expect(result.status, result.stderr + result.stdout).toBe(0)
        return result.stdout
      }
      run('scripts/generate-scale-instruments.ts'); run('scripts/generate-scale-instruments.ts', '--check')
      run('scripts/scale-onboarding-check.mjs')
      expect(run('src/__tests__/scale/fixtures/unknown-scale-runner.ts', ...keys)).toContain('UNKNOWN_SCALE_FULL_PATH_OK')
    } finally { rmSync(workspace, { recursive: true, force: true }) }
  }, 120000)
})
