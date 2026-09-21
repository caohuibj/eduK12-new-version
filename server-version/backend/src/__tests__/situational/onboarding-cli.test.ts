import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { classifySituationalPath } from '../../modules/situational/onboarding/path-policy'

const backend = path.resolve(__dirname, '../../..')
const script = path.join(backend, 'src/scripts/situational-onboarding-check.ts')
const tsx = path.join(backend, 'node_modules/.bin/tsx')
describe('SJT authoring CLI and actual content-only diff', () => {
  it('emits reproducible JSON and rejects an ambiguous comparison base', () => {
    const run = () => execFileSync(tsx, [script, '--all', '--json'], { cwd: backend, encoding: 'utf8' })
    expect(run()).toBe(run())
    expect(JSON.parse(run()).ok).toBe(true)
    const failed = spawnSync(tsx, [script, '--content-only', '--base', 'HEAD'], { cwd: backend, encoding: 'utf8' })
    expect(failed.status).not.toBe(0)
    expect(failed.stderr).toContain('full 40-character')
  })
  it('scaffolds and generates an unknown package with zero shared-core edits', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sjt-content-diff-'))
    const prefix = 'server-version/backend/'
    const target = path.join(root, prefix)
    const run = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' })
    try {
      mkdirSync(path.join(target, 'scripts'), { recursive: true })
      for (const name of ['generate-situational-instruments.mjs', 'scaffold-situational-instrument.mjs']) cpSync(path.join(backend, 'scripts', name), path.join(target, 'scripts', name))
      cpSync(path.join(backend, 'src/modules/situational/instruments/sjt-anxiety-golden'), path.join(target, 'src/modules/situational/instruments/sjt-anxiety-golden'), { recursive: true })
      const generate = path.join(target, 'scripts/generate-situational-instruments.mjs')
      execFileSync(process.execPath, [generate])
      run('init', '-q'); run('add', '-f', '.'); run('-c', 'user.name=SJT Test', '-c', 'user.email=sjt-test@example.invalid', 'commit', '-qm', 'fixture baseline')
      execFileSync(process.execPath, [path.join(target, 'scripts/scaffold-situational-instrument.mjs'), 'unknown-author-task@1.0.0', '--from', 'sjt-anxiety-golden@1.0.0'])
      execFileSync(process.execPath, [generate])
      execFileSync(process.execPath, [generate, '--check'])
      const paths = [...run('diff', '--name-only', 'HEAD').trim().split('\n'), ...run('ls-files', '--others', '--exclude-standard').trim().split('\n')].filter(Boolean)
      expect(paths, JSON.stringify(paths)).toHaveLength(4)
      expect(paths.map(classifySituationalPath)).not.toContain('SHARED_CORE')
      const own = path.join(target, 'src/modules/situational/instruments/unknown-author-task/1.0.0')
      expect(JSON.parse(readFileSync(path.join(own, 'publication.json'), 'utf8'))).toEqual({ releaseStatus: 'DRAFT' })
      const manifest = path.join(target, 'src/modules/situational/onboarding/instruments.generated.ts')
      // Load the actual generated imports, not just its textual content.
      const loaded = execFileSync(tsx, ['-e', `import {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES as s} from ${JSON.stringify(manifest)}; console.log(s.length)`], { cwd: backend, encoding: 'utf8' })
      expect(loaded.trim()).toBe('2')
      writeFileSync(manifest, '// drift')
      expect(spawnSync(process.execPath, [generate, '--check']).status).not.toBe(0)
      writeFileSync(path.join(own, 'arbitrary.js'), 'throw new Error("must never execute")')
      expect(spawnSync(process.execPath, [generate]).status).not.toBe(0)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 15000)
})
