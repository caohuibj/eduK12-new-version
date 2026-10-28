import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, type Prisma } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { resolveEducationToolAuthoringContext } from '../../modules/education-tools/access'
import { resolveEducationProductMemberScope } from '../../modules/organization/educationProductAccess'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
async function fixture(tx: Prisma.TransactionClient) {
  const user = await tx.user.create({ data: { id: randomUUID(), username: 'edua_' + randomUUID(), passwordHash: 'synthetic', accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true } })
  const org = await tx.organization.create({ data: { id: randomUUID(), name: 'Synthetic authoring school', productDomain: 'SCHOOL', createdByUserId: user.id } })
  const member = await tx.organizationMembership.create({ data: { id: randomUUID(), organizationId: org.id, userId: user.id } })
  await tx.educationProductEntitlement.create({ data: { organizationId: org.id, product: 'HUITEACHER', status: 'ACTIVE', grantedByUserId: user.id } })
  const persona = await tx.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: org.id, membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: user.id } })
  const capability = await tx.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: org.id, membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: user.id } })
  const administrator = await tx.educationProductRoleGrant.create({ data: { id: randomUUID(), organizationId: org.id, membershipId: member.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', grantedByUserId: user.id } })
  const input = { principal: { userId: user.id, accountDomain: 'SCHOOL' as const }, organizationId: org.id, entry: 'TEACHER' as const }
  return { user, org, member, persona, capability, administrator, input }
}
async function schoolInput(tx: Prisma.TransactionClient, f: Awaited<ReturnType<typeof fixture>>) {
  await tx.educationProductEntitlement.create({ data: { organizationId: f.org.id, product: 'HUISCHOOL', status: 'ACTIVE', grantedByUserId: f.user.id } })
  return { ...f.input, entry: 'SCHOOL' as const }
}
// Every fixture lives only inside an isolated, rolled-back test transaction.
async function check(run: (tx: Prisma.TransactionClient, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const rollback = new Error('ROLLBACK_SYNTHETIC_AUTHORING_FIXTURE')
  try {
    await db.$transaction(async tx => { await run(tx, await fixture(tx)); throw rollback })
  } catch (error) { if (error !== rollback) throw error }
}
suite('School/Teacher authoring current PostgreSQL authority', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it('allows Teacher-only entitlement and requires a separate School entitlement', () => check(async (tx, f) => {
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toMatchObject({ ownerUserId: f.user.id, product: 'HUITEACHER', defaultVisibility: 'AUTHOR_PRIVATE' })
    expect(await resolveEducationToolAuthoringContext({ ...f.input, entry: 'SCHOOL' }, tx)).toBeNull()
    await tx.educationProductEntitlement.create({ data: { organizationId: f.org.id, product: 'HUISCHOOL', status: 'ACTIVE', grantedByUserId: f.user.id } })
    expect(await resolveEducationToolAuthoringContext({ ...f.input, entry: 'SCHOOL' }, tx)).toMatchObject({ product: 'HUISCHOOL' })
  }))
  it.each(['persona', 'capability'] as const)('keeps School dependent on its %s without restricting Teacher administration or participant membership', kind => check(async (tx, f) => {
    const school = await schoolInput(tx, f)
    // PostgreSQL retains microseconds; JavaScript Date truncation may equal
    // granted_at and violate the strict grant interval constraint.
    if (kind === 'persona') await tx.$executeRaw`UPDATE organization_persona_grants SET revoked_at=clock_timestamp() WHERE id=${f.persona.id}`
    else await tx.$executeRaw`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${f.capability.id}`
    expect(await resolveEducationToolAuthoringContext(school, tx)).toBeNull()
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).not.toBeNull()
    expect(await resolveEducationProductMemberScope({ actorUserId: f.user.id, organizationId: f.org.id, product: 'HUITEACHER' }, tx)).not.toBeNull()
  }))
  it.each(['*', 'EDUCATION_ACCESS', 'HUITEACHER_ACCESS', 'HUITEACHER_ADMIN'])('honors explicit %s deny even for Teacher administrators', permission => check(async (tx, f) => {
    await tx.user.update({ where: { id: f.user.id }, data: { role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } })
    await tx.organizationMembership.update({ where: { id: f.member.id }, data: { orgRole: 'ORG_ADMIN' } })
    await tx.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: f.org.id, userId: f.user.id, permission, reason: 'Synthetic deny', deniedByUserId: f.user.id } })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
  }))
  it('does not replace School professional authority with administration or Teacher administration with global, organization or School roles', () => check(async (tx, f) => {
    const school = await schoolInput(tx, f)
    await tx.user.update({ where: { id: f.user.id }, data: { role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } })
    await tx.organizationMembership.update({ where: { id: f.member.id }, data: { orgRole: 'ORG_ADMIN' } })
    await tx.educationProductRoleGrant.create({ data: { id: randomUUID(), organizationId: f.org.id, membershipId: f.member.id, product: 'HUISCHOOL', role: 'PRODUCT_ADMIN', grantedByUserId: f.user.id } })
    await tx.$executeRaw`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${f.capability.id}`
    expect(await resolveEducationProductMemberScope({ actorUserId: f.user.id, organizationId: f.org.id, product: 'HUITEACHER' }, tx)).toMatchObject({ productAdmin: true })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).not.toBeNull()
    expect(await resolveEducationToolAuthoringContext(school, tx)).toBeNull()
    await tx.$executeRaw`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${f.user.id} WHERE id=${f.administrator.id}`
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
  }))
  it('rejects a Teacher psychology author after product administration is revoked, retaining ordinary participant membership', () => check(async (tx, f) => {
    await tx.$executeRaw`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${f.user.id} WHERE id=${f.administrator.id}`
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
    expect(await resolveEducationProductMemberScope({ actorUserId: f.user.id, organizationId: f.org.id, product: 'HUITEACHER' }, tx)).toMatchObject({ productAdmin: false })
    expect(await resolveEducationToolAuthoringContext(await schoolInput(tx, f), tx)).not.toBeNull()
  }))
  it('keeps School psychology deny separate from Teacher product administration', () => check(async (tx, f) => {
    const school = await schoolInput(tx, f)
    await tx.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: f.org.id, userId: f.user.id, permission: 'PSYCHOLOGY_STAFF', reason: 'Synthetic deny', deniedByUserId: f.user.id } })
    expect(await resolveEducationToolAuthoringContext(school, tx)).toBeNull()
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).not.toBeNull()
  }))
  it('cannot combine a counselor persona here with a psychology capability in another school', () => check(async (tx, f) => {
    const school = await schoolInput(tx, f)
    const other = await fixture(tx)
    await schoolInput(tx, other)
    await tx.$executeRaw`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${f.capability.id}`
    const otherMembership = await tx.organizationMembership.create({ data: { id: randomUUID(), organizationId: other.org.id, userId: f.user.id } })
    await tx.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: other.org.id, membershipId: otherMembership.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.user.id } })
    expect(await resolveEducationToolAuthoringContext(school, tx)).toBeNull()
    expect(await resolveEducationToolAuthoringContext({ ...school, organizationId: other.org.id }, tx)).toBeNull()
    expect(await resolveEducationToolAuthoringContext({ ...f.input, organizationId: other.org.id }, tx)).toBeNull()
  }))
  it('does not apply an unrelated School-product deny to Teacher', () => check(async (tx, f) => {
    await tx.organizationAccessDeny.create({ data: { id: randomUUID(), organizationId: f.org.id, userId: f.user.id, permission: 'HUISCHOOL_ACCESS', reason: 'Synthetic deny', deniedByUserId: f.user.id } })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).not.toBeNull()
  }))
  it.each([{ isActive: false }, { isFrozen: true }, { mustChangePassword: true }, { teacherApproved: false }, { expiresAt: new Date('2000-01-01') }, { accountDomain: 'SURVEY' as const }])('rejects current Teacher account restrictions %j', patch => check(async (tx, f) => {
    if ('accountDomain' in patch) {
      // Account domains are immutable. Test a mismatched authenticated
      // principal without illegally changing the persisted SCHOOL account.
      expect(await resolveEducationToolAuthoringContext({ ...f.input, principal: { ...f.input.principal, accountDomain: patch.accountDomain } }, tx)).toBeNull()
      return
    }
    await tx.user.update({ where: { id: f.user.id }, data: patch })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
  }))
  it('rejects expired membership and cannot reuse its grants on a replacement membership', () => check(async (tx, f) => {
    await tx.organizationMembership.update({ where: { id: f.member.id }, data: { validUntil: new Date('2000-01-01'), validFrom: new Date('1999-01-01') } })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
    await tx.organizationMembership.create({ data: { id: randomUUID(), organizationId: f.org.id, userId: f.user.id } })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
  }))
  it('does not use another school’s grants or reveal its membership', () => check(async (tx, f) => {
    const other = await fixture(tx)
    expect(await resolveEducationToolAuthoringContext({ ...f.input, organizationId: other.org.id }, tx)).toBeNull()
    await tx.organizationMembership.create({ data: { id: randomUUID(), organizationId: other.org.id, userId: f.user.id } })
    expect(await resolveEducationToolAuthoringContext({ ...f.input, organizationId: other.org.id }, tx)).toBeNull()
  }))
  it('rejects suspended organization and product entitlement', () => check(async (tx, f) => {
    await tx.organization.update({ where: { id: f.org.id }, data: { status: 'SUSPENDED' } })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
    await tx.organization.update({ where: { id: f.org.id }, data: { status: 'ACTIVE' } })
    await tx.educationProductEntitlement.updateMany({ where: { organizationId: f.org.id }, data: { status: 'SUSPENDED', suspendedAt: new Date() } })
    expect(await resolveEducationToolAuthoringContext(f.input, tx)).toBeNull()
  }))
})
