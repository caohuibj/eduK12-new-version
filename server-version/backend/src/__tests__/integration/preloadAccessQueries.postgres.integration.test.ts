import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../../modules/organization/access'
import { organizationController } from '../../modules/organization/organization.controller'
import { integrationDatabaseUrl } from './integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if (!url) throw new Error('Preload access query test requires an explicit isolated PostgreSQL URL')
if (new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.includes('_ci')) {
  throw new Error('Only the explicitly isolated loopback CI database is supported')
}
let rawCalls = 0
beforeAll(() => {
  prisma.$use(async (params, next) => {
    if (params.action === 'queryRaw') rawCalls++
    return next(params)
  })
})
afterAll(async () => { await prisma.$disconnect() })

async function fixture(domain: 'TRAINING' | 'SCHOOL' = 'TRAINING') {
  const user = await prisma.user.create({ data: {
    username: 'lt-fixture-' + randomUUID(), passwordHash: 'synthetic-only',
    role: 'TEACHER', accountDomain: domain,
  } })
  const org = await prisma.organization.create({ data: {
    id: randomUUID(), name: 'LOADTEST isolated query fixture',
    createdByUserId: user.id, productDomain: domain === 'SCHOOL' ? 'SCHOOL' : 'LEGACY',
  } })
  const member = await prisma.organizationMembership.create({ data: {
    id: randomUUID(), organizationId: org.id, userId: user.id, orgRole: 'ORG_ADMIN',
  } })
  if (domain === 'SCHOOL') await prisma.educationProductEntitlement.create({ data: {
    organizationId: org.id, product: 'HUISCHOOL', grantedByUserId: user.id,
  } })
  const input = { organizationId: org.id, principal: { userId: user.id, platformRole: 'STANDARD' as const } }
  return { user, org, member, input }
}

describe('Preload organization access query budget (real PostgreSQL)', () => {
  it('uses one statement without multiplying personas, capabilities or explicit denies', async () => {
    const f = await fixture()
    await prisma.organizationPersonaGrant.createMany({ data: ['TEACHER', 'COUNSELOR'].map(persona => ({
      id: randomUUID(), organizationId: f.org.id, membershipId: f.member.id,
      persona, grantedByUserId: f.user.id,
    })) })
    await prisma.organizationCapabilityGrant.createMany({ data: ['REPORT_EXPORT', 'PSYCHOLOGY_STAFF'].map(capability => ({
      id: randomUUID(), organizationId: f.org.id, membershipId: f.member.id,
      capability, grantedByUserId: f.user.id,
    })) })
    await prisma.organizationAccessDeny.createMany({ data: ['REPORT_READ', 'REPORT_EXPORT'].map(permission => ({
      id: randomUUID(), organizationId: f.org.id, userId: f.user.id,
      permission, reason: 'synthetic fixture', deniedByUserId: f.user.id,
    })) })
    rawCalls = 0
    const c = await resolveOrganizationAccessContext(f.input)
    expect(rawCalls).toBe(1)
    expect(c?.personas.sort()).toEqual(['COUNSELOR', 'TEACHER'])
    expect(c?.capabilities.sort()).toEqual(['PSYCHOLOGY_STAFF', 'REPORT_EXPORT'])
    expect(c?.explicitDenies.sort()).toEqual(['REPORT_EXPORT', 'REPORT_READ'])
    expect(c?.canGovern).toBe(true)
  })
  it('downgrades shared School ORG_ADMIN until the School product grant is current', async () => {
    const f = await fixture('SCHOOL')
    expect((await resolveOrganizationAccessContext(f.input))?.orgRole).toBe('MEMBER')
    const grant = await prisma.educationProductRoleGrant.create({ data: {
      id: randomUUID(), organizationId: f.org.id, membershipId: f.member.id,
      product: 'HUISCHOOL', role: 'PRODUCT_ADMIN', grantedByUserId: f.user.id,
    } })
    expect((await resolveOrganizationAccessContext(f.input))?.canGovern).toBe(true)
    await prisma.educationProductRoleGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date(), revokedByUserId: f.user.id } })
    expect((await resolveOrganizationAccessContext(f.input))?.canGovern).toBe(false)
  })
  it('rejects cross-domain access even for a supplied platform administrator', async () => {
    const f = await fixture('SCHOOL')
    const other = await prisma.user.create({ data: {
      username: 'lt-legacy-' + randomUUID(), passwordHash: 'synthetic-only', accountDomain: 'TRAINING',
    } })
    expect(await resolveOrganizationAccessContext({
      organizationId: f.org.id, principal: { userId: other.id, platformRole: 'SYSTEM_ADMIN' },
    })).toBeNull()
  })
  it.each(['*', 'EDUCATION_ACCESS', 'HUISCHOOL_ACCESS'])('honors current School deny %s', async permission => {
    const f = await fixture('SCHOOL')
    await prisma.organizationAccessDeny.create({ data: {
      id: randomUUID(), organizationId: f.org.id, userId: f.user.id,
      permission, reason: 'synthetic deny', deniedByUserId: f.user.id,
    } })
    expect(await resolveOrganizationAccessContext(f.input)).toBeNull()
  })
  it('does not carry ended membership grants into the next lookup', async () => {
    const f = await fixture()
    await prisma.organizationPersonaGrant.create({ data: {
      id: randomUUID(), organizationId: f.org.id, membershipId: f.member.id,
      persona: 'TEACHER', grantedByUserId: f.user.id,
    } })
    expect((await resolveOrganizationAccessContext(f.input))?.membershipId).toBe(f.member.id)
    await prisma.$executeRaw`UPDATE organization_memberships SET valid_from=statement_timestamp()-interval '1 minute', valid_until=statement_timestamp() WHERE id=${f.member.id}`
    const c = await resolveOrganizationAccessContext(f.input)
    expect(c?.membershipId).toBeNull()
    expect(c?.personas).toEqual([])
    expect(c?.canGovern).toBe(false)
  })
  it('uses the passed transaction and observes its uncommitted authority changes', async () => {
    const f = await fixture()
    await prisma.$transaction(async tx => {
      await tx.organizationAccessDeny.create({ data: {
        id: randomUUID(), organizationId: f.org.id, userId: f.user.id,
        permission: 'ORGANIZATION_GOVERNANCE', reason: 'transaction fixture', deniedByUserId: f.user.id,
      } })
      expect((await resolveOrganizationAccessContext(f.input, tx))?.canGovern).toBe(false)
    })
    expect((await resolveOrganizationAccessContext(f.input))?.canGovern).toBe(false)
  })
  it('reads navigation access once while preserving the exact organization response', async () => {
    const f = await fixture()
    let result: any
    const res: any = { status: () => res, json: (body: any) => { result = body; return res } }
    rawCalls = 0
    await organizationController.readContext({
      user: f.input.principal, params: { organizationId: f.org.id },
    } as any, res)
    expect(result.code).toBe(0)
    expect(result.data.organization).toEqual({ id: f.org.id, name: f.org.name, status: 'ACTIVE' })
    expect(result.data.allowedActions).toContain('GOVERN')
    expect(result.data.allowedActions).toContain('ASSESSMENT_DELIVERY')
    expect(rawCalls).toBe(2) // one authority snapshot + one public organization row
  })
})
