import { describe, it, expect } from 'vitest'
import { assertHistory, readSmoke, smokeSchema } from '../../../scripts/bundle-content-check'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { dependencyBlockers } from '../../modules/assessment-bundle/onboarding/dependencies'
import { verifyPackageFixtures } from '../../modules/assessment-bundle/onboarding/fixtures'
import { generatePackages, writePackage } from '../../modules/assessment-bundle/onboarding/loader'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

describe('content gate negative canaries', () => {
  it('rejects old version mutation or deletion even when platform checks were selected', () => {
    const before = new Map([['packages/p/1.0.0/rules.json', 'original']])
    expect(() => assertHistory(before, new Map())).toThrow('DELETED')
    expect(() => assertHistory(before, new Map([['packages/p/1.0.0/rules.json', 'changed']]))).toThrow('IMMUTABLE')
    expect(() => assertHistory(before, new Map([...before, ['packages/p/1.0.1/rules.json', 'new']]))).not.toThrow()
  })
  it('rejects broken rules, incorrect golden expectations and nonexistent dependencies', () => {
    const p = scaffoldPackage('ci_canary')
    expect(() => verifyPackageFixtures(p)).not.toThrow()
    p.fixtures.valid.expectedRuleIds = []
    expect(() => verifyPackageFixtures(p)).toThrow('FIXTURE_MISMATCH')
    p.fixtures.valid.expectedRuleIds = ['observed']
    p.manifest.definition.slots[0].instrumentKey = 'missing_dependency'
    expect(dependencyBlockers(p).join()).toContain('unknown SITUATIONAL')
    p.rules.items[0].when = { op: 'present', evidenceKey: 'unknown' }
    expect(() => verifyPackageFixtures(p)).toThrow()
  })
  it('accepts a new package and rejects hand-edited generated output', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'c4-generated-'))
    try {
      const root = path.join(dir, 'packages'), output = path.join(dir, 'generated.json')
      writePackage(path.join(root, 'ci_canary', '1.0.0'), scaffoldPackage('ci_canary'))
      generatePackages(root, output)
      expect(() => generatePackages(root, output, true)).not.toThrow()
      writeFileSync(output, '[]\n')
      expect(() => generatePackages(root, output, true)).toThrow('MANIFEST_DRIFT')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('manual branch dispatch cannot hide an old-version overwrite by comparing HEAD to itself', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'c4-manual-'))
    const git = (...args: string[]) => execFileSync('git', args, {cwd:dir,stdio:'pipe'})
    try {
      git('init','-q')
      const file = path.join(dir,'server-version/backend/src/modules/assessment-bundle/packages/example/1.0.0/rules.json')
      mkdirSync(path.dirname(file),{recursive:true}); writeFileSync(file,'original')
      git('add','.'); git('-c','user.name=CI Test','-c','user.email=ci@example.invalid','commit','-qm','base')
      git('update-ref','refs/remotes/origin/main','HEAD')
      writeFileSync(file,'changed')
      git('add','.'); git('-c','user.name=CI Test','-c','user.email=ci@example.invalid','commit','-qm','overwrite')
      expect(() => execFileSync(process.execPath,[
        path.resolve(__dirname,'../../../node_modules/tsx/dist/cli.mjs'),
        path.resolve(__dirname,'../../../scripts/bundle-content-check.ts'),
      ],{cwd:dir,stdio:'pipe',env:{...process.env,GITHUB_EVENT_NAME:'workflow_dispatch',BUNDLE_CONTENT_BASE_SHA:'',BUNDLE_CONTENT_EVIDENCE:''}})).toThrow('BUNDLE_VERSION_IMMUTABLE')
    } finally { rmSync(dir,{recursive:true,force:true}) }
  },15000)
  it('requires explicit synthetic runtime samples, strict keys, exact identities and bounded trials', () => {
    const fixture = readSmoke('example_descriptive_v1', '1.0.0')
    expect(smokeSchema.safeParse(fixture).success).toBe(true)
    for (const mutation of [{ ...fixture, synthetic: false }, { ...fixture, unexpected: true },
      { ...fixture, slots: { c: { type: 'COGNITIVE', trials: Array(10001).fill({}) } } }]) {
      expect(smokeSchema.safeParse(mutation).success).toBe(false)
    }
    expect(() => readSmoke('../example', '1.0.0')).toThrow('IDENTITY')
    expect(() => readSmoke('example_descriptive_v1', 'latest')).toThrow('IDENTITY')
  })
})
