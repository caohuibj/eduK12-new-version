import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashDeclarativePackage, type DeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { writePackage } from '../../modules/assessment-bundle/onboarding/loader'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { syncBundleGitReleases } from '../../modules/bundle-product/git-release'
import { changePackageStatus, installPackage, publishPackage } from '../../modules/bundle-product/package-release'
import { ensureGitScalePublisher } from '../../modules/scale/onboarding/git-release-actor'
import { publishStaticMeasurementFixture } from '../fixtures/published-measurement'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('BUNDLE_GIT_TEST_DATABASE_URL', 'RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const commit = 'a'.repeat(40)
suite('declared Bundle releases in an isolated PostgreSQL transaction', () => {
  let db: PrismaClient, actor: string, systemAdmin: string, root: string
  const suffix = randomUUID().replaceAll('-', '')
  const key = 'bundle_git_' + suffix
  const manual = 'bundle_manual_' + suffix
  const packageKeys = [key, manual]
  const releaseWhere = (bundleKey: string, bundleVersion = '1.0.0') => ({ bundleKey_bundleVersion: { bundleKey, bundleVersion } })
  const manifest = (bundleKey: string, releases: unknown[]) =>
    fs.writeFileSync(path.join(root, bundleKey, 'releases.json'), JSON.stringify({ schemaVersion: 1, toolKey: bundleKey, releases }))
  const declaration = (pack: DeclarativePackage, state: 'ONLINE' | 'HOLD' | 'WITHDRAWN' | 'RETIRED', replaces?: string) => {
    const contentHash = hashDeclarativePackage(pack)
    return { releaseKey: pack.manifest.definition.bundleVersion, contentHash, state, allowedEntries: ['SURVEY'],
      ...(state === 'ONLINE' ? { review: { contentHash, claims: ['independent_summary'] } } : {}),
      ...(replaces ? { replaces } : {}) }
  }
  const sync = (who = actor) => db.$transaction(tx => syncBundleGitReleases(root, tx, who, commit), { timeout: 30_000 })
  const read = (bundleKey: string, version?: string) => db.bundlePackageRelease.findUniqueOrThrow({ where: releaseWhere(bundleKey, version) })
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    db = new PrismaClient({ datasources: { db: { url } } })
    actor = await ensureGitScalePublisher(db)
    systemAdmin = (await db.user.create({ data: { username: 'bundle-git-fixture-' + suffix,
      passwordHash: 'unusable-fixture', platformRole: 'SYSTEM_ADMIN', role: 'TEACHER', accountDomain: 'TRAINING' } })).id
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-git-lifecycle-'))
  })
  afterAll(async () => {
    if (db) {
      await db.surveyEvent.deleteMany({ where: { action: 'GIT_BUNDLE_RELEASE_SYNCED', OR: packageKeys.map(key => ({ metadata: { path: ['bundleKey'], equals: key } })) } })
      await db.bundlePackageRelease.deleteMany({ where: { bundleKey: { in: packageKeys } } })
      if (systemAdmin) await db.user.deleteMany({ where: { id: systemAdmin } })
      await db.$disconnect()
    }
    if (root) fs.rmSync(root, { force: true, recursive: true })
  })

  it('applies explicit state, replays without writes, preserves manual holds and rolls back failed replacement', async () => {
    const original = scaffoldPackage(key)
    writePackage(path.join(root, key, '1.0.0'), original)
    expect(await sync()).toEqual([])
    manifest(key, [declaration(original, 'ONLINE')])
    await expect(sync(systemAdmin)).rejects.toThrow('BUNDLE_GIT_AUTHORITY_REQUIRED')
    const slot = original.manifest.definition.slots[0]
    await publishStaticMeasurementFixture(db, { instrumentKey: slot.instrumentKey, instrumentVersion: slot.instrumentVersion })
    expect(await sync()).toMatchObject([{ key, action: 'PUBLISHED' }])
    const first = await read(key)
    expect(first).toMatchObject({ installedBy: actor, publishedBy: actor, status: 'PUBLISHED',
      review: { source: 'SYSTEM_GIT_RELEASE', gitCommitSha: commit, claims: ['independent_summary'] } })
    expect(first.review).not.toHaveProperty('reviewerId')
    expect(first.review).not.toHaveProperty('signature')
    expect(await sync()).toMatchObject([{ action: 'UNCHANGED', releaseId: first.id }])
    expect(await read(key)).toEqual(first)
    const receipts = await db.surveyEvent.findMany({ where: {
      action: 'GIT_BUNDLE_RELEASE_SYNCED', metadata: { path: ['releaseId'], equals: first.id },
    } })
    expect(receipts).toMatchObject([{ metadata: {
      toolKey: key, releaseKey: '1.0.0', state: 'ONLINE', effectiveState: 'ONLINE', allowedEntries: ['SURVEY'],
    } }])

    const changedReview = declaration(original, 'ONLINE')
    manifest(key, [{ ...changedReview, review: { ...changedReview.review, claims: ['independent_summary', 'joint_conclusion'] } }])
    await expect(sync()).rejects.toThrow('BUNDLE_GIT_REVIEW_IMMUTABLE')
    expect(await read(key)).toEqual(first)

    const next = structuredClone(original)
    next.manifest.definition.bundleVersion = '2.0.0'
    next.manifest.definition.slots[0] = { ...slot, unitType: 'SCALE', instrumentKey: 'sci8_zh_cn_research',
      valueSelectors: ['sleep_condition'] }
    next.evidence[0].selector = 'sleep_condition'
    writePackage(path.join(root, key, '2.0.0'), next)
    manifest(key, [declaration(original, 'ONLINE'), declaration(next, 'ONLINE', '1.0.0')])
    await expect(sync()).rejects.toThrow('BUNDLE_GIT_SCALE_NOT_ONLINE')
    expect(await db.bundlePackageRelease.findUnique({ where: releaseWhere(key, '2.0.0') })).toBeNull()
    expect(await read(key)).toEqual(first)

    manifest(key, [declaration(original, 'HOLD')])
    expect(await sync()).toMatchObject([{ state: 'HOLD', action: 'UNCHANGED' }])
    expect(await read(key)).toEqual(first)

    const replacement = structuredClone(original)
    replacement.manifest.definition.bundleVersion = '2.1.0'
    writePackage(path.join(root, key, '2.1.0'), replacement)
    manifest(key, [declaration(original, 'ONLINE'), declaration(replacement, 'ONLINE', '1.0.0')])
    expect(await sync()).toMatchObject([
      { releaseKey: '1.0.0', state: 'ONLINE', effectiveState: 'WITHDRAWN', action: 'WITHDRAWN', releaseId: first.id },
      { releaseKey: '2.1.0', state: 'ONLINE', action: 'PUBLISHED' },
    ])
    expect(await read(key)).toMatchObject({ content: first.content, review: first.review, status: 'HOLD' })
    expect((await read(key, '2.1.0')).status).toBe('PUBLISHED')

    manifest(key, [declaration(original, 'ONLINE'), declaration(replacement, 'WITHDRAWN')])
    expect(await sync()).toMatchObject([{ action: 'WITHDRAWN' }, { action: 'RESTORED', releaseId: first.id }])
    expect(await read(key)).toMatchObject({ content: first.content, status: 'PUBLISHED' })
    expect((await read(key, '2.1.0')).status).toBe('HOLD')

    await changePackageStatus(db, systemAdmin, key, '2.1.0', 'HOLD')
    const operatorHold = await read(key, '2.1.0')
    manifest(key, [declaration(original, 'ONLINE'), declaration(replacement, 'ONLINE', '1.0.0')])
    expect(await sync()).toMatchObject([{ action: 'WITHDRAWN' }, { action: 'MANUAL_HOLD' }])
    expect((await read(key)).status).toBe('HOLD')
    expect(await read(key, '2.1.0')).toEqual(operatorHold)

    manifest(key, [declaration(original, 'ONLINE')])
    expect(await sync()).toMatchObject([{ action: 'RESTORED', releaseId: first.id }])
    await changePackageStatus(db, systemAdmin, key, '1.0.0', 'HOLD')
    expect(await sync()).toMatchObject([{ action: 'MANUAL_HOLD', releaseId: first.id }])
    const predecessorHold = await read(key)
    expect(predecessorHold.status).toBe('HOLD')
    manifest(key, [declaration(original, 'WITHDRAWN'), declaration(replacement, 'ONLINE', '1.0.0')])
    await expect(sync()).rejects.toThrow('BUNDLE_GIT_REPLACEMENT_PREDECESSOR_CHANGED')
    expect(await read(key)).toEqual(predecessorHold)
  }, 45_000)

  it('keeps a release published by a person outside Git lifecycle control', async () => {
    fs.rmSync(path.join(root, key, 'releases.json'), { force: true })
    const pack = scaffoldPackage(manual)
    writePackage(path.join(root, manual, '1.0.0'), pack)
    await installPackage(db, systemAdmin, pack)
    const first = await publishPackage(db, systemAdmin, manual, '1.0.0', declaration(pack, 'ONLINE').review)
    manifest(manual, [declaration(pack, 'ONLINE')])
    expect(await sync()).toMatchObject([{ key: manual, action: 'MANUAL' }])
    manifest(manual, [declaration(pack, 'WITHDRAWN')])
    await expect(sync()).rejects.toThrow('BUNDLE_GIT_MANUAL_RELEASE_CONFLICT')
    expect(await read(manual)).toEqual(first)
  })
})
