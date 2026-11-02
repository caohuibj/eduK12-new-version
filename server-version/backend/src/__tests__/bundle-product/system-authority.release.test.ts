import { createHmac } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash, canonicalJsonString } from '../../modules/assessment-runtime/canonical'
import { packageEntry } from '../../modules/assessment-bundle/onboarding/catalog'
import { hashDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { previewPackage } from '../../modules/bundle-product/admin-authoring'
import { freezeBundleProductionDefinition, readFrozenBundleProductionDefinition } from '../../modules/bundle-product/definition-provider'
import { assertPackageAdmission, changePackageStatus } from '../../modules/bundle-product/package-release'
import { UserRole } from '../../types'

const secret = 'synthetic-system-authority-review-key-only'
const authority = (overrides: Record<string, unknown> = {}) => ({
  id: 'synthetic-system', role: 'STUDENT', platformRole: 'SYSTEM_ADMIN',
  isActive: true, isFrozen: false, expiresAt: null, ...overrides,
})
const denied = [
  { name: 'raw ADMIN with STANDARD platform role', value: authority({ role: 'ADMIN', platformRole: 'STANDARD' }) },
  { name: 'ordinary teacher', value: authority({ role: 'TEACHER', platformRole: 'STANDARD' }) },
  { name: 'inactive system administrator', value: authority({ isActive: false }) },
  { name: 'frozen system administrator', value: authority({ isFrozen: true }) },
  { name: 'expired system administrator', value: authority({ expiresAt: new Date(0) }) },
]
function releaseFixture(user: ReturnType<typeof authority>) {
  const pack = scaffoldPackage('synthetic_system_authority')
  const contentHash = hashDeclarativePackage(pack)
  const material = {
    contentHash, reviewerId: 'synthetic-reviewer', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    claims: ['independent_summary'], scientific: true, rights: true, language: true, report: true,
  }
  const review = { ...material, signature: createHmac('sha256', secret).update(canonicalJsonString(material)).digest('hex') }
  let row = { id: 'synthetic-release', bundleKey: pack.manifest.definition.bundleKey, bundleVersion: '1.0.0', contentHash,
    content: pack, installedBy: 'synthetic-installer', publishedBy: 'synthetic-publisher', status: 'PUBLISHED', review }
  const findUser = vi.fn(async () => user)
  const update = vi.fn(async ({ data }: { data: { status: string } }) => { row = { ...row, status: data.status }; return row })
  const tx = { user: { findUnique: findUser }, $executeRaw: vi.fn(async () => 0), $queryRaw: vi.fn(async () => []),
    bundlePackageRelease: { findUnique: vi.fn(async () => row), findUniqueOrThrow: vi.fn(async () => row), update } }
  const db = { ...tx, $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } as unknown as PrismaClient
  return { db, tx, pack, review, update, row: () => row }
}
beforeEach(() => vi.stubEnv('BUNDLE_REVIEW_SIGNING_KEY', secret))
afterEach(() => vi.unstubAllEnvs())

describe('current system authority on Bundle release transitions and new admission', () => {
  it.each(['TEACHER', 'STUDENT'])('allows a current SYSTEM_ADMIN with raw %s business role', async role => {
    const f = releaseFixture(authority({ role }))
    const result = await changePackageStatus(f.db, 'synthetic-system', f.row().bundleKey, '1.0.0', 'HOLD')
    expect(result.status).toBe('HOLD')
    expect(result.review).toEqual(f.review)
    expect(f.update).toHaveBeenCalledOnce()
  })
  it('accepts a system administrator whose account expiry is still in the future', async () => {
    const f = releaseFixture(authority({ expiresAt: new Date(Date.now() + 3600000) }))
    expect((await changePackageStatus(f.db, 'synthetic-system', f.row().bundleKey, '1.0.0', 'HOLD')).status).toBe('HOLD')
  })
  it.each(denied)('rejects $name before a release transition', async ({ value }) => {
    const f = releaseFixture(value)
    await expect(changePackageStatus(f.db, 'synthetic-system', f.row().bundleKey, '1.0.0', 'HOLD')).rejects.toThrow('BUNDLE_ADMIN_REQUIRED')
    expect(f.update).not.toHaveBeenCalled()
    expect(f.row()).toMatchObject({ status: 'PUBLISHED', review: f.review })
  })
  it.each(denied)('rejects a new admission whose signed reviewer is now $name', async ({ value }) => {
    const f = releaseFixture(value)
    await expect(assertPackageAdmission(f.tx as never, f.pack)).rejects.toThrow('BUNDLE_ADMIN_REQUIRED')
    expect(f.tx.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'synthetic-reviewer' } }))
    expect(f.update).not.toHaveBeenCalled()
    expect(f.row().review).toEqual(f.review)
  })
  it('retains review evidence and a readable frozen historical definition through HOLD and RETIRED', async () => {
    const f = releaseFixture(authority())
    const frozen = freezeBundleProductionDefinition(packageEntry(f.pack), { frozenAt: new Date().toISOString(), sourceReference: 'synthetic-admitted-history' })
    const originalFrozenHash = canonicalHash(frozen), originalContentHash = f.row().contentHash
    for (const status of ['HOLD', 'RETIRED'] as const) {
      await changePackageStatus(f.db, 'synthetic-system', f.row().bundleKey, '1.0.0', status)
      await expect(assertPackageAdmission(f.tx as never, f.pack)).rejects.toThrow('BUNDLE_PACKAGE_NOT_PUBLISHED')
      expect(f.row().contentHash).toBe(originalContentHash)
      expect(f.row().review).toEqual(f.review)
      expect(canonicalHash(readFrozenBundleProductionDefinition(frozen))).toBe(originalFrozenHash)
    }
  })
  it('does not turn current reviewer demotion into a mutation of admitted frozen history', async () => {
    const reviewer = authority({ id: 'synthetic-reviewer' })
    const f = releaseFixture(reviewer)
    const frozen = freezeBundleProductionDefinition(packageEntry(f.pack), { frozenAt: new Date().toISOString(), sourceReference: 'synthetic-admitted-history' })
    const original = canonicalHash(frozen)
    reviewer.platformRole = 'STANDARD'
    await expect(assertPackageAdmission(f.tx as never, f.pack)).rejects.toThrow('BUNDLE_ADMIN_REQUIRED')
    expect(canonicalHash(readFrozenBundleProductionDefinition(frozen))).toBe(original)
    expect(f.row().review).toEqual(f.review)
    expect(f.update).not.toHaveBeenCalled()
  })
})

describe('Bundle authoring authority before content preview', () => {
  it.each([UserRole.TEACHER, UserRole.STUDENT])('allows SYSTEM_ADMIN with %s business role to preview an existing synthetic package', role => {
    const pack = scaffoldPackage('synthetic_system_preview')
    const preview = previewPackage({ userId: 'synthetic-system', role, platformRole: 'SYSTEM_ADMIN' }, pack)
    expect(preview.definition.bundleKey).toBe(pack.manifest.definition.bundleKey)
    expect(preview.contentHash).toBe(hashDeclarativePackage(pack))
  })
  it.each([UserRole.ADMIN, UserRole.TEACHER])('rejects STANDARD %s before previewing content', role => {
    expect(() => previewPackage({ userId: 'synthetic-standard', role, platformRole: 'STANDARD' }, null)).toThrow(expect.objectContaining({ statusCode: 403 }))
  })
})
