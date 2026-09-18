import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ParentRelationshipStatus, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { loadCurrentPrincipal } from '../../modules/organization/principal'
import { resolveOrganizationAccessContext } from '../../modules/organization/access'
import { hasCurrentParentOrganizationEvidence } from '../../modules/organization/parentEvidence'
import {
  createMembership,
  createOrganization,
  denyOrganizationAccess,
  endMembership,
  rejoinMembership,
  setMembershipRole,
} from '../../modules/organization/service'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

let db: PrismaClient
const runSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const commandKey = (label: string) => `org-pr1-${label}-${runSuffix}-${randomUUID()}`

async function createUser(label: string, role: UserRole = UserRole.STUDENT) {
  return db.user.create({
    data: {
      username: `org-pr1-${label}-${runSuffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
    },
    select: { id: true, username: true, role: true },
  })
}

suite('Organization PR1 hard gates (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('I-01 reads platform demotion from current DB state, not an unexpired credential snapshot', async () => {
    const systemAdmin = await createUser('i01-system', UserRole.ADMIN)
    const creator = await createUser('i01-creator', UserRole.TEACHER)
    const created = await createOrganization({
      name: `I01 ${runSuffix}`,
      meta: { actorUserId: creator.id, commandKey: commandKey('i01-create') },
    })

    await db.$executeRaw`
      UPDATE "users"
      SET "platform_role" = 'SYSTEM_ADMIN'::"PlatformRole"
      WHERE "id" = ${systemAdmin.id}
    `
    const before = await loadCurrentPrincipal(systemAdmin.id)
    expect(before?.platformRole).toBe('SYSTEM_ADMIN')
    const allowedBefore = await resolveOrganizationAccessContext({
      principal: before!,
      organizationId: created.organization.id,
    })
    expect(allowedBefore?.canGovern).toBe(true)

    await db.$executeRaw`
      UPDATE "users"
      SET "platform_role" = 'STANDARD'::"PlatformRole"
      WHERE "id" = ${systemAdmin.id}
    `
    const after = await loadCurrentPrincipal(systemAdmin.id)
    expect(after?.platformRole).toBe('STANDARD')
    const allowedAfter = await resolveOrganizationAccessContext({
      principal: after!,
      organizationId: created.organization.id,
    })
    expect(allowedAfter?.canGovern).toBe(false)
  })

  it('explicit deny outranks SYSTEM_ADMIN organization governance', async () => {
    const creator = await createUser('deny-creator', UserRole.TEACHER)
    const systemAdmin = await createUser('deny-system', UserRole.ADMIN)
    const created = await createOrganization({
      name: `deny precedence ${runSuffix}`,
      meta: { actorUserId: creator.id, commandKey: commandKey('deny-create') },
    })
    await db.$executeRaw`
      UPDATE "users" SET "platform_role" = 'SYSTEM_ADMIN'::"PlatformRole" WHERE "id" = ${systemAdmin.id}
    `
    await denyOrganizationAccess({
      organizationId: created.organization.id,
      userId: systemAdmin.id,
      permission: 'ORGANIZATION_GOVERNANCE',
      reason: 'test explicit deny precedence',
      meta: { actorUserId: creator.id, commandKey: commandKey('deny-command') },
    })

    const principal = await loadCurrentPrincipal(systemAdmin.id)
    const context = await resolveOrganizationAccessContext({
      principal: principal!,
      organizationId: created.organization.id,
    })
    expect(context?.basis).toContain('SYSTEM_ADMIN')
    expect(context?.explicitDenies).toContain('ORGANIZATION_GOVERNANCE')
    expect(context?.canGovern).toBe(false)
  })

  it('I-02 allows only one current membership under concurrent create', async () => {
    const actor = await createUser('i02-actor', UserRole.TEACHER)
    const member = await createUser('i02-member')
    const created = await createOrganization({
      name: `I02 ${runSuffix}`,
      meta: { actorUserId: actor.id, commandKey: commandKey('i02-create-org') },
    })

    const results = await Promise.allSettled([
      createMembership({
        organizationId: created.organization.id,
        userId: member.id,
        meta: { actorUserId: actor.id, commandKey: commandKey('i02-a') },
      }),
      createMembership({
        organizationId: created.organization.id,
        userId: member.id,
        meta: { actorUserId: actor.id, commandKey: commandKey('i02-b') },
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "organization_memberships"
      WHERE "organization_id" = ${created.organization.id}
        AND "user_id" = ${member.id}
        AND "valid_until" IS NULL
    `
    expect(rows[0]?.count).toBe(1)
  })

  it('I-03 ends M1 and rejoins as a distinct M2 without resurrecting history', async () => {
    const actor = await createUser('i03-actor', UserRole.TEACHER)
    const member = await createUser('i03-member')
    const created = await createOrganization({
      name: `I03 ${runSuffix}`,
      meta: { actorUserId: actor.id, commandKey: commandKey('i03-create-org') },
    })
    const m1 = await createMembership({
      organizationId: created.organization.id,
      userId: member.id,
      meta: { actorUserId: actor.id, commandKey: commandKey('i03-m1') },
    })
    await endMembership({
      organizationId: created.organization.id,
      membershipId: m1.id,
      reason: 'episode end test',
      meta: { actorUserId: actor.id, commandKey: commandKey('i03-end') },
    })
    const m2 = await rejoinMembership({
      organizationId: created.organization.id,
      userId: member.id,
      meta: { actorUserId: actor.id, commandKey: commandKey('i03-m2') },
    })

    expect(m2.id).not.toBe(m1.id)
    const rows = await db.$queryRaw<Array<{ id: string; validUntil: Date | null }>>`
      SELECT "id", "valid_until" AS "validUntil"
      FROM "organization_memberships"
      WHERE "organization_id" = ${created.organization.id}
        AND "user_id" = ${member.id}
      ORDER BY "valid_from" ASC
    `
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.id === m1.id)?.validUntil).not.toBeNull()
    expect(rows.find((row) => row.id === m2.id)?.validUntil).toBeNull()
  })

  it('I-04 removes parent current-tenant evidence when child membership ends', async () => {
    const actor = await createUser('i04-actor', UserRole.TEACHER)
    const parent = await createUser('i04-parent', UserRole.PARENT)
    const child = await createUser('i04-child', UserRole.STUDENT)
    const created = await createOrganization({
      name: `I04 ${runSuffix}`,
      meta: { actorUserId: actor.id, commandKey: commandKey('i04-create-org') },
    })
    const childMembership = await createMembership({
      organizationId: created.organization.id,
      userId: child.id,
      meta: { actorUserId: actor.id, commandKey: commandKey('i04-child-membership') },
    })
    await db.parentStudentRelationship.create({
      data: {
        parentUserId: parent.id,
        studentUserId: child.id,
        status: ParentRelationshipStatus.ACTIVE,
        approvedByUserId: actor.id,
        approvedAt: new Date(),
      },
    })

    await expect(hasCurrentParentOrganizationEvidence({
      parentUserId: parent.id,
      studentUserId: child.id,
      organizationId: created.organization.id,
    })).resolves.toBe(true)

    await endMembership({
      organizationId: created.organization.id,
      membershipId: childMembership.id,
      reason: 'left tenant',
      meta: { actorUserId: actor.id, commandKey: commandKey('i04-end-child') },
    })

    await expect(hasCurrentParentOrganizationEvidence({
      parentUserId: parent.id,
      studentUserId: child.id,
      organizationId: created.organization.id,
    })).resolves.toBe(false)
  })

  it('I-05 serializes concurrent admin demotions so one valid ORG_ADMIN remains', async () => {
    const actor = await createUser('i05-actor', UserRole.TEACHER)
    const secondAdmin = await createUser('i05-second-admin', UserRole.TEACHER)
    const created = await createOrganization({
      name: `I05 ${runSuffix}`,
      meta: { actorUserId: actor.id, commandKey: commandKey('i05-create-org') },
    })
    const second = await createMembership({
      organizationId: created.organization.id,
      userId: secondAdmin.id,
      orgRole: 'ORG_ADMIN',
      meta: { actorUserId: actor.id, commandKey: commandKey('i05-second-admin') },
    })

    const results = await Promise.allSettled([
      setMembershipRole({
        organizationId: created.organization.id,
        membershipId: created.membership.id,
        orgRole: 'MEMBER',
        meta: { actorUserId: actor.id, commandKey: commandKey('i05-demote-a') },
      }),
      setMembershipRole({
        organizationId: created.organization.id,
        membershipId: second.id,
        orgRole: 'MEMBER',
        meta: { actorUserId: actor.id, commandKey: commandKey('i05-demote-b') },
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "organization_memberships"
      WHERE "organization_id" = ${created.organization.id}
        AND "org_role" = 'ORG_ADMIN'
        AND "valid_until" IS NULL
    `
    expect(rows[0]?.count).toBe(1)
  })

  it('I-06 rolls domain mutation, audit, and receipt back together on audit failure', async () => {
    const actor = await createUser('i06-actor', UserRole.TEACHER)
    const target = await createUser('i06-target')
    const created = await createOrganization({
      name: `I06 ${runSuffix}`,
      meta: { actorUserId: actor.id, commandKey: commandKey('i06-create-org') },
    })
    const key = commandKey('i06-membership')

    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION reject_pr1_i06_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'MEMBERSHIP_CREATED' AND NEW.payload->>'userId' = '${target.id}' THEN
          RAISE EXCEPTION 'PR1 I-06 forced audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS organization_governance_audits_pr1_i06 ON "organization_governance_audits"`)
    await db.$executeRawUnsafe(`
      CREATE TRIGGER organization_governance_audits_pr1_i06
      BEFORE INSERT ON "organization_governance_audits"
      FOR EACH ROW EXECUTE FUNCTION reject_pr1_i06_audit()
    `)

    try {
      await expect(createMembership({
        organizationId: created.organization.id,
        userId: target.id,
        meta: { actorUserId: actor.id, commandKey: key },
      })).rejects.toThrow()
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS organization_governance_audits_pr1_i06 ON "organization_governance_audits"`)
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS reject_pr1_i06_audit()`)
    }

    const [memberships, audits, receipts] = await Promise.all([
      db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count" FROM "organization_memberships"
        WHERE "organization_id" = ${created.organization.id} AND "user_id" = ${target.id}
      `,
      db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count" FROM "organization_governance_audits"
        WHERE "organization_id" = ${created.organization.id}
          AND "action" = 'MEMBERSHIP_CREATED'
          AND "payload"->>'userId' = ${target.id}
      `,
      db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count" FROM "organization_command_receipts"
        WHERE "actor_user_id" = ${actor.id}
          AND "organization_id" = ${created.organization.id}
          AND "command_key" = ${key}
      `,
    ])
    expect(memberships[0]?.count).toBe(0)
    expect(audits[0]?.count).toBe(0)
    expect(receipts[0]?.count).toBe(0)

    const committed = await createMembership({
      organizationId: created.organization.id,
      userId: target.id,
      meta: { actorUserId: actor.id, commandKey: key },
    })
    const replay = await createMembership({
      organizationId: created.organization.id,
      userId: target.id,
      meta: { actorUserId: actor.id, commandKey: key },
    })
    expect(replay.id).toBe(committed.id)

    const committedAudits = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "organization_governance_audits"
      WHERE "organization_id" = ${created.organization.id}
        AND "action" = 'MEMBERSHIP_CREATED'
        AND "payload"->>'userId' = ${target.id}
    `
    expect(committedAudits[0]?.count).toBe(1)
  })

  it('DB constraints reject direct-SQL invalid intervals and duplicate current memberships', async () => {
    const actor = await createUser('db-actor', UserRole.TEACHER)
    const member = await createUser('db-member')
    const created = await createOrganization({
      name: `DB constraints ${runSuffix}`,
      meta: { actorUserId: actor.id, commandKey: commandKey('db-create-org') },
    })
    await createMembership({
      organizationId: created.organization.id,
      userId: member.id,
      meta: { actorUserId: actor.id, commandKey: commandKey('db-current') },
    })

    await expect(db.$executeRaw`
      INSERT INTO "organization_memberships" (
        "id", "organization_id", "user_id", "org_role", "valid_from", "valid_until"
      ) VALUES (
        ${randomUUID()}, ${created.organization.id}, ${member.id}, 'MEMBER',
        transaction_timestamp(), transaction_timestamp()
      )
    `).rejects.toThrow()

    await expect(db.$executeRaw`
      INSERT INTO "organization_memberships" (
        "id", "organization_id", "user_id", "org_role"
      ) VALUES (
        ${randomUUID()}, ${created.organization.id}, ${member.id}, 'MEMBER'
      )
    `).rejects.toThrow()
  })
})
