import { randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { writePackage } from '../../modules/assessment-bundle/onboarding/loader'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { syncContentReleases } from '../../modules/measurement-content/git-release-plane'
import { loadDeclaredScaleReleases } from '../../modules/scale/declarative/load'
import { ensureGitScalePublisher } from '../../modules/scale/onboarding/git-release-actor'
import { syncGitScaleReleases } from '../../modules/scale/onboarding/git-release-publication'
import { governedRow } from '../../modules/survey/governed-tool.service'
import { standardReleaseRow } from '../../modules/survey/standard-triplet.service'
import { requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { writeSjtDeclaration } from '../situational/git-release.fixture'

const url = process.env.CONTENT_GIT_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
const modules = resolve(__dirname, '../../modules')

suite('unified content publisher with an isolated PostgreSQL database', () => {
  let db: PrismaClient
  let actorId: string
  const sync = (root: string, commit: string) => syncContentReleases(db, root, { actorId, gitCommitSha: commit.repeat(40) })

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    db = new PrismaClient({ datasources: { db: { url } } })
    actorId = await ensureGitScalePublisher(db)
  })
  afterAll(async () => { if (db) await db.$disconnect() })

  it('publishes a Form-only snapshot without withdrawing existing Scale and SJT releases', async () => {
    const root = mkdtempSync(join(tmpdir(), 'content-omission-'))
    const sjt = 'sjt-omission-' + randomUUID()
    try {
      const scaleReleases = loadDeclaredScaleReleases(join(modules, 'scale/instruments'), ['who5'])
      const [scale] = await syncGitScaleReleases(db, { actorId, gitCommitSha: 'a'.repeat(40), releases: scaleReleases })
      writeSjtDeclaration(join(root, 'sjt'), sjt)
      const initial = await sync(root, 'b')
      expect(initial.scale).toEqual([])
      expect(initial.sjt).toMatchObject([{ action: 'PUBLISHED' }])
      rmSync(join(root, 'sjt'), { recursive: true })

      const toolKey = 'demographics_v1'
      const form = join(root, 'form', toolKey)
      mkdirSync(join(root, 'form'))
      cpSync(join(modules, 'form/templates', toolKey), form, { recursive: true })
      const control = join(form, 'releases.json')
      const declaration = JSON.parse(readFileSync(control, 'utf8'))
      declaration.releases[0].state = 'ONLINE'
      writeFileSync(control, JSON.stringify(declaration))

      const published = await sync(root, 'c')
      expect(published).toMatchObject({ scale: [], sjt: [], form: [{ action: 'PUBLISHED' }] })
      expect((await standardReleaseRow(db, scale.releaseId)).state).toBe('ONLINE')
      expect((await governedRow(db, initial.sjt[0].id!)).state).toBe('ONLINE')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('rolls back earlier family writes when a prepared Bundle fails a live dependency check', async () => {
    const root = mkdtempSync(join(tmpdir(), 'content-atomic-'))
    const sjt = 'sjt-atomic-' + randomUUID()
    try {
      writeSjtDeclaration(join(root, 'sjt'), sjt)
      const bundleKey = 'bundle_atomic_' + randomUUID().replaceAll('-', '')
      const bundle = scaffoldPackage(bundleKey)
      const directory = join(root, 'bundle', bundleKey)
      const contentHash = hashDeclarativePackage(bundle)
      mkdirSync(directory, { recursive: true })
      writePackage(join(directory, '1.0.0'), bundle)
      writeFileSync(join(directory, 'releases.json'), JSON.stringify({
        schemaVersion: 1, toolKey: bundleKey,
        releases: [{
          releaseKey: '1.0.0', state: 'ONLINE', allowedEntries: ['SURVEY'], contentHash,
          review: { contentHash, claims: ['independent_summary'] },
        }],
      }))

      await expect(sync(root, 'd')).rejects.toThrow(/CONTENT_STATIC_SJT/)
      expect(await db.$queryRaw`SELECT id FROM survey_governed_tools WHERE tool_key=${'SJT:git:' + sjt}`).toEqual([])
      expect(await db.bundlePackageRelease.count({ where: { bundleKey } })).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})
