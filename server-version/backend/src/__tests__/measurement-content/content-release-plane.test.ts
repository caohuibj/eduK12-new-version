import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { checkContentRelease } from '../../modules/measurement-content/git-release-plane'
import { cognitiveDeclarationFixture } from '../cognitive/git-release.fixture'
import { writeSjtDeclaration } from '../situational/git-release.fixture'

it('checks Git SJT and Cognitive selections alongside the checked-in legacy SJT registry', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'content-release-layout-'))
  const cognitive = cognitiveDeclarationFixture()
  const backend = resolve(__dirname, '../../..')
  const stagedBackend = join(repo, 'server-version/backend')
  const modules = 'src/modules'
  const generator = 'scripts/generate-situational-instruments.mjs'
  const situational = modules + '/situational'
  const instruments = situational + '/instruments'
  const registry = situational + '/onboarding/instruments.generated.ts'
  try {
    for (const path of [generator, instruments, registry]) {
      mkdirSync(dirname(join(stagedBackend, path)), { recursive: true })
      cpSync(join(backend, path), join(stagedBackend, path), { recursive: true })
    }
    writeSjtDeclaration(join(stagedBackend, instruments), 'sample-sjt')
    cpSync(cognitive.root, join(stagedBackend, modules, 'cognitive/tasks'), { recursive: true })

    execFileSync(process.execPath, [generator, '--check'], { cwd: stagedBackend })
    const [sjt, cognitiveRelease] = await Promise.all([
      checkContentRelease(repo, 'sjt:sample-sjt'),
      checkContentRelease(repo, 'cognitive:gonogo'),
    ])
    expect(sjt).toMatchObject({ releases: [{ releaseKey: 'first', state: 'ONLINE', effectiveState: 'ONLINE' }] })
    expect(cognitiveRelease).toMatchObject({ releases: [
      { releaseKey: 'fictional-release1', effectiveState: 'ONLINE' },
      { releaseKey: 'fictional-release2', effectiveState: 'WITHDRAWN' },
    ] })
  } finally {
    rmSync(repo, { recursive: true, force: true })
    rmSync(cognitive.root, { recursive: true, force: true })
  }
}, 60_000)
