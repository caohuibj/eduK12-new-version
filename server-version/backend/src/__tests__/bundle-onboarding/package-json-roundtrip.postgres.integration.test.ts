import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, expect, it, describe } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { loadPackage } from '../../modules/assessment-bundle/onboarding/loader'
import { hashDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { installPackage } from '../../modules/bundle-product/package-release'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('BUNDLE_JSON_ROUNDTRIP_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
suite('Bundle installer JSON numeric roundtrip', () => {
  const db = new PrismaClient({ datasources: { db: { url } } })
  afterAll(() => db.$disconnect())
  it('creates a real row without changing a valid fractional omission rate or the frozen package identity', async () => {
    requireIsolatedReleaseDatabase(url!)
    const actorId = 'bundle-json-admin-' + randomUUID()
    await db.user.create({ data: { id: actorId, username: actorId, passwordHash: 'SYNTHETIC ONLY', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } })
    const pack = loadPackage(path.resolve(__dirname, '../../modules/assessment-bundle/packages/integrated_gonogo_adexi_adult_zh_cn_v1/1.1.0'))
    pack.manifest.definition.bundleKey = 'bundle_json_roundtrip_' + randomUUID().replace(/-/g, '')
    // The reported failure used this exact valid 1/36 fraction. No rounding,
    // integer conversion or scoring change is permitted to repair storage.
    const fraction = 0.027777777777777776
    pack.fixtures.valid.values['cpt.omission_rate'] = { state: 'present', value: fraction }
    pack.fixtures.valid.values['cpt.hit_count'] = { state: 'present', value: 35 }
    const expected = hashDeclarativePackage(pack)
    const installed = await installPackage(db, actorId, pack)
    const read = await db.bundlePackageRelease.findUniqueOrThrow({ where: { id: installed.id } })
    const [raw] = await db.$queryRaw<Array<{ content: string }>>`SELECT content::text AS content FROM bundle_package_releases WHERE id = ${installed.id}`
    const parsed = JSON.parse(raw.content)
    expect(parsed.fixtures.valid.values['cpt.omission_rate'].value).toBe(fraction)
    expect((read.content as any).fixtures.valid.values['cpt.omission_rate'].value).toBe(fraction)
    expect(hashDeclarativePackage(parsed)).toBe(expected)
    expect(hashDeclarativePackage(read.content)).toBe(expected)
    expect(read).toMatchObject({ status: 'DRAFT', contentHash: expected, installedBy: actorId })
  })
})
