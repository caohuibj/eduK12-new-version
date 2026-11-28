import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { expect, it, vi } from 'vitest'
import { checkContentRelease, syncContentReleases } from '../../modules/measurement-content/git-release-plane'
import { GIT_RELEASE_ACTOR_ID } from '../../utils/gitReleaseIdentity'
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

it('recognizes actual family controls and finishes static validation before opening a transaction', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-preflight-'))
  const transaction = vi.fn()
  const db = { $transaction: transaction } as unknown as PrismaClient
  const options = { actorId: GIT_RELEASE_ACTOR_ID, gitCommitSha: 'a'.repeat(40) }
  const key = 'demographics_v1'
  const form = join(root, 'form', key)
  try {
    mkdirSync(join(form, 'reports'), { recursive: true })
    writeFileSync(join(form, 'reports/releases.json'), '{}')
    await expect(syncContentReleases(db, root, options)).rejects.toThrow('supported content release control file')
    expect(transaction).not.toHaveBeenCalled()

    cpSync(resolve(__dirname, '../../modules/form/templates', key), form, { recursive: true })
    writeFileSync(join(form, '1.0.0.json'), '{}')
    await expect(syncContentReleases(db, root, options)).rejects.toThrow('FORM_RELEASE_AXIS_HASH_MISMATCH')
    expect(transaction).not.toHaveBeenCalled()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)

it('applies the optional transaction timeout from the ops environment', async () => {
  const root = mkdtempSync(join(tmpdir(), 'content-timeout-'))
  const transaction = vi.fn()
  const db = { $transaction: transaction } as unknown as PrismaClient
  const options = { actorId: GIT_RELEASE_ACTOR_ID, gitCommitSha: 'a'.repeat(40) }
  const key = 'demographics_v1'
  try {
    mkdirSync(join(root, 'form'))
    cpSync(resolve(__dirname, '../../modules/form/templates', key), join(root, 'form', key), { recursive: true })
    vi.stubEnv('CONTENT_RELEASE_TRANSACTION_TIMEOUT_MS', '')
    await expect(syncContentReleases(db, root, options)).rejects.toThrow('CONTENT_RELEASE_TRANSACTION_TIMEOUT_MS')
    expect(transaction).not.toHaveBeenCalled()

    vi.stubEnv('CONTENT_RELEASE_TRANSACTION_TIMEOUT_MS', undefined)
    await syncContentReleases(db, root, options)
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), { timeout: 120_000 })

    vi.stubEnv('CONTENT_RELEASE_TRANSACTION_TIMEOUT_MS', '180000')
    await syncContentReleases(db, root, options)
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), { timeout: 180_000 })
  } finally {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)

it.each([
  './src/modules/cognitive/session.service.ts',
  './src/workers/exportBatchChild.ts',
])('initializes %s in a fresh Node process', (entry) => {
  execFileSync(process.execPath, ['--import', 'tsx', '-e', 'require(process.argv[1]); process.exit(0)', entry], {
    cwd: resolve(__dirname, '../../..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/eduk12_import_test',
      DATABASE_URL_RUNTIME: '',
      REDIS_URL: 'redis://127.0.0.1:1',
    },
    timeout: 25_000,
  })
}, 30_000)
