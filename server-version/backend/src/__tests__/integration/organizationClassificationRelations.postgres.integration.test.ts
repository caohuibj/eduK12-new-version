import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import {
  createMembership,
  createOrganization,
  grantPersona,
  revokePersona,
} from '../../modules/organization/service'
import {
  assignOrganizationLabel,
  createClassificationDimension,
  createCounselorClientRelationship,
  createOrganizationLabel,
  hasCurrentCounselorClientAuthority,
} from '../../modules/organization/classificationRelations'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `classify-${label}-${suffix}-${randomUUID()}`

async function createUser(label: string) {
  return db.user.create({
    data: {
      username: `classify-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
    },
    select: { id: true },
  })
}

suite('Organization classification and professional relations (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('enforces SINGLE under concurrency while MULTI accepts distinct labels', async () => {
    const owner = await createUser('dimension-owner')
    const member = await createUser('dimension-member')
    const org = await createOrganization({ name: `classification ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('dimension-org') } })
    const membership = await createMembership({ organizationId: org.organization.id, userId: member.id, meta: { actorUserId: owner.id, commandKey: key('dimension-member') } })

    const single = await createClassificationDimension({ organizationId: org.organization.id, key: `single-${suffix}`, name: 'Single', cardinality: 'SINGLE' })
    const singleA = await createOrganizationLabel({ organizationId: org.organization.id, dimensionId: single.id, name: 'A' })
    const singleB = await createOrganizationLabel({ organizationId: org.organization.id, dimensionId: single.id, name: 'B' })
    const singleResults = await Promise.allSettled([
      assignOrganizationLabel({ organizationId: org.organization.id, membershipId: membership.id, labelId: singleA.id }),
      assignOrganizationLabel({ organizationId: org.organization.id, membershipId: membership.id, labelId: singleB.id }),
    ])
    expect(singleResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(singleResults.filter((r) => r.status === 'rejected')).toHaveLength(1)

    const multi = await createClassificationDimension({ organizationId: org.organization.id, key: `multi-${suffix}`, name: 'Multi', cardinality: 'MULTI' })
    const multiA = await createOrganizationLabel({ organizationId: org.organization.id, dimensionId: multi.id, name: 'M1' })
    const multiB = await createOrganizationLabel({ organizationId: org.organization.id, dimensionId: multi.id, name: 'M2' })
    await expect(Promise.all([
      assignOrganizationLabel({ organizationId: org.organization.id, membershipId: membership.id, labelId: multiA.id }),
      assignOrganizationLabel({ organizationId: org.organization.id, membershipId: membership.id, labelId: multiB.id }),
    ])).resolves.toHaveLength(2)
  })

  it('tenant-binds dimension, label and membership at the database layer', async () => {
    const ownerA = await createUser('label-a')
    const ownerB = await createUser('label-b')
    const orgA = await createOrganization({ name: `label A ${suffix}`, meta: { actorUserId: ownerA.id, commandKey: key('label-a-org') } })
    const orgB = await createOrganization({ name: `label B ${suffix}`, meta: { actorUserId: ownerB.id, commandKey: key('label-b-org') } })
    const dimensionB = await createClassificationDimension({ organizationId: orgB.organization.id, key: `cross-${suffix}`, name: 'Cross', cardinality: 'MULTI' })
    const labelB = await createOrganizationLabel({ organizationId: orgB.organization.id, dimensionId: dimensionB.id, name: 'Foreign' })

    await expect(db.$executeRawUnsafe(
      `INSERT INTO "organization_label_assignments" ("id","organization_id","membership_id","dimension_id","dimension_cardinality","label_id") VALUES ($1,$2,$3,$4,'MULTI',$5)`,
      randomUUID(), orgA.organization.id, orgA.membership.id, dimensionB.id, labelB.id,
    )).rejects.toBeTruthy()
  })

  it('requires COUNSELOR and CLIENT personas and revocation removes current authority without deleting provenance', async () => {
    const owner = await createUser('relation-owner')
    const counselor = await createUser('counselor')
    const client = await createUser('client')
    const org = await createOrganization({ name: `professional ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('relation-org') } })
    const counselorMembership = await createMembership({ organizationId: org.organization.id, userId: counselor.id, meta: { actorUserId: owner.id, commandKey: key('counselor-member') } })
    const clientMembership = await createMembership({ organizationId: org.organization.id, userId: client.id, meta: { actorUserId: owner.id, commandKey: key('client-member') } })

    await expect(createCounselorClientRelationship({
      organizationId: org.organization.id,
      counselorMembershipId: counselorMembership.id,
      clientMembershipId: clientMembership.id,
    })).rejects.toMatchObject({ code: 'PERSONA_REQUIRED' })

    await grantPersona({ organizationId: org.organization.id, membershipId: counselorMembership.id, persona: 'COUNSELOR', meta: { actorUserId: owner.id, commandKey: key('counselor-persona') } })
    await grantPersona({ organizationId: org.organization.id, membershipId: clientMembership.id, persona: 'CLIENT', meta: { actorUserId: owner.id, commandKey: key('client-persona') } })
    const relationship = await createCounselorClientRelationship({ organizationId: org.organization.id, counselorMembershipId: counselorMembership.id, clientMembershipId: clientMembership.id })
    await expect(hasCurrentCounselorClientAuthority({ organizationId: org.organization.id, counselorMembershipId: counselorMembership.id, clientMembershipId: clientMembership.id })).resolves.toBe(true)

    await revokePersona({ organizationId: org.organization.id, membershipId: counselorMembership.id, persona: 'COUNSELOR', meta: { actorUserId: owner.id, commandKey: key('counselor-revoke') } })
    await expect(hasCurrentCounselorClientAuthority({ organizationId: org.organization.id, counselorMembershipId: counselorMembership.id, clientMembershipId: clientMembership.id })).resolves.toBe(false)

    const history = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "organization_counselor_client_relationships" WHERE id=$1`,
      relationship.id,
    )
    expect(history[0]?.id).toBe(relationship.id)
  })

  it('retains a valid relationship command across a lock wait longer than the old transaction limit', async () => {
    const owner = await createUser('slow-relation-owner')
    const counselor = await createUser('slow-counselor')
    const client = await createUser('slow-client')
    const org = await createOrganization({ name: `slow professional ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('slow-relation-org') } })
    const counselorMembership = await createMembership({ organizationId: org.organization.id, userId: counselor.id, meta: { actorUserId: owner.id, commandKey: key('slow-counselor-member') } })
    const clientMembership = await createMembership({ organizationId: org.organization.id, userId: client.id, meta: { actorUserId: owner.id, commandKey: key('slow-client-member') } })
    await grantPersona({ organizationId: org.organization.id, membershipId: counselorMembership.id, persona: 'COUNSELOR', meta: { actorUserId: owner.id, commandKey: key('slow-counselor-persona') } })
    await grantPersona({ organizationId: org.organization.id, membershipId: clientMembership.id, persona: 'CLIENT', meta: { actorUserId: owner.id, commandKey: key('slow-client-persona') } })

    let locked!: () => void
    let unlock!: () => void
    let holderPid = 0
    const acquired = new Promise<void>((resolve) => { locked = resolve })
    const release = new Promise<void>((resolve) => { unlock = resolve })
    const holder = db.$transaction(async (tx) => {
      holderPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org.organization.id} FOR UPDATE`
      locked()
      await release
    }, { timeout: 15_000 })
    await acquired
    const relationship = createCounselorClientRelationship({ organizationId: org.organization.id,
      counselorMembershipId: counselorMembership.id, clientMembershipId: clientMembership.id })
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
    try {
      let blocked = false
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const rows = await db.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE ${holderPid}=ANY(pg_blocking_pids(a.pid))) AS blocked
        `
        if (rows[0].blocked) { blocked = true; break }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(blocked).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 5_500))
    } finally { unlock() }
    await holder
    const result = await relationship
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.organizationId).toBe(org.organization.id)
  }, 30_000)

  it('rejects cross-tenant COUNSELOR_CLIENT relation directly in PostgreSQL', async () => {
    const ownerA = await createUser('professional-a')
    const ownerB = await createUser('professional-b')
    const counselor = await createUser('professional-counselor')
    const client = await createUser('professional-client')
    const orgA = await createOrganization({ name: `professional A ${suffix}`, meta: { actorUserId: ownerA.id, commandKey: key('professional-a') } })
    const orgB = await createOrganization({ name: `professional B ${suffix}`, meta: { actorUserId: ownerB.id, commandKey: key('professional-b') } })
    const counselorMembership = await createMembership({ organizationId: orgA.organization.id, userId: counselor.id, meta: { actorUserId: ownerA.id, commandKey: key('professional-counselor-member') } })
    const clientMembership = await createMembership({ organizationId: orgB.organization.id, userId: client.id, meta: { actorUserId: ownerB.id, commandKey: key('professional-client-member') } })
    await grantPersona({ organizationId: orgA.organization.id, membershipId: counselorMembership.id, persona: 'COUNSELOR', meta: { actorUserId: ownerA.id, commandKey: key('professional-counselor-persona') } })
    await grantPersona({ organizationId: orgB.organization.id, membershipId: clientMembership.id, persona: 'CLIENT', meta: { actorUserId: ownerB.id, commandKey: key('professional-client-persona') } })

    await expect(db.$executeRawUnsafe(
      `INSERT INTO "organization_counselor_client_relationships" ("id","organization_id","counselor_membership_id","client_membership_id") VALUES ($1,$2,$3,$4)`,
      randomUUID(), orgA.organization.id, counselorMembership.id, clientMembership.id,
    )).rejects.toBeTruthy()
  })
})
