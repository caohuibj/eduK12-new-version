import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import {
  createMembership,
  createOrganization,
  endMembership,
  grantPersona,
  revokePersona,
} from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import {
  assignStaffToClass,
  assignStudentToClass,
  hasCurrentStudentClassAuthority,
} from '../../modules/organization/classRelationships'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `class-rel-${label}-${suffix}-${randomUUID()}`

async function createUser(label: string) {
  return db.user.create({
    data: {
      username: `class-rel-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
    },
    select: { id: true },
  })
}

suite('Organization student/staff relationship episodes (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('enforces one current primary Class under concurrent assignment', async () => {
    const owner = await createUser('primary-owner')
    const student = await createUser('primary-student')
    const org = await createOrganization({ name: `primary ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('primary-org') } })
    const membership = await createMembership({
      organizationId: org.organization.id,
      userId: student.id,
      meta: { actorUserId: owner.id, commandKey: key('primary-member') },
    })
    await grantPersona({
      organizationId: org.organization.id,
      membershipId: membership.id,
      persona: 'STUDENT',
      meta: { actorUserId: owner.id, commandKey: key('primary-persona') },
    })
    const grade = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'GRADE', name: 'Grade 9' })
    const classA = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'CLASS', name: 'A', parentUnitId: grade.id })
    const classB = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'CLASS', name: 'B', parentUnitId: grade.id })

    const results = await Promise.allSettled([
      assignStudentToClass({ organizationId: org.organization.id, membershipId: membership.id, classUnitId: classA.id, isPrimary: true }),
      assignStudentToClass({ organizationId: org.organization.id, membershipId: membership.id, classUnitId: classB.id, isPrimary: true }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)

    const rows = await db.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM "organization_student_class_assignments" WHERE "organization_id"=$1 AND "membership_id"=$2 AND "valid_until" IS NULL AND "is_primary"=TRUE`,
      org.organization.id,
      membership.id,
    )
    expect(rows[0]?.count).toBe(1)
  })

  it('requires current Persona at creation and revocation removes current authority without deleting history', async () => {
    const owner = await createUser('persona-owner')
    const student = await createUser('persona-student')
    const org = await createOrganization({ name: `persona ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('persona-org') } })
    const membership = await createMembership({
      organizationId: org.organization.id,
      userId: student.id,
      meta: { actorUserId: owner.id, commandKey: key('persona-member') },
    })
    const grade = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'GRADE', name: 'Grade 10' })
    const classroom = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'CLASS', name: 'C', parentUnitId: grade.id })

    await expect(assignStudentToClass({
      organizationId: org.organization.id,
      membershipId: membership.id,
      classUnitId: classroom.id,
    })).rejects.toMatchObject({ code: 'PERSONA_REQUIRED' })

    await grantPersona({
      organizationId: org.organization.id,
      membershipId: membership.id,
      persona: 'STUDENT',
      meta: { actorUserId: owner.id, commandKey: key('persona-grant') },
    })
    const assignment = await assignStudentToClass({ organizationId: org.organization.id, membershipId: membership.id, classUnitId: classroom.id })
    await expect(hasCurrentStudentClassAuthority({ organizationId: org.organization.id, membershipId: membership.id, classUnitId: classroom.id })).resolves.toBe(true)

    await revokePersona({
      organizationId: org.organization.id,
      membershipId: membership.id,
      persona: 'STUDENT',
      meta: { actorUserId: owner.id, commandKey: key('persona-revoke') },
    })
    await expect(hasCurrentStudentClassAuthority({ organizationId: org.organization.id, membershipId: membership.id, classUnitId: classroom.id })).resolves.toBe(false)

    const historical = await db.$queryRawUnsafe<Array<{ id: string; validUntil: Date | null }>>(
      `SELECT id, valid_until AS "validUntil" FROM "organization_student_class_assignments" WHERE id=$1`,
      assignment.id,
    )
    expect(historical[0]?.id).toBe(assignment.id)
    expect(historical[0]?.validUntil).toBeNull()
  })

  it('requires TEACHER Persona for staff assignment and rejects ended Memberships', async () => {
    const owner = await createUser('staff-owner')
    const staff = await createUser('staff-member')
    const org = await createOrganization({ name: `staff ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('staff-org') } })
    const membership = await createMembership({
      organizationId: org.organization.id,
      userId: staff.id,
      meta: { actorUserId: owner.id, commandKey: key('staff-member') },
    })
    await grantPersona({
      organizationId: org.organization.id,
      membershipId: membership.id,
      persona: 'TEACHER',
      meta: { actorUserId: owner.id, commandKey: key('staff-persona') },
    })
    const grade = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'GRADE', name: 'Grade 11' })
    const classroom = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'CLASS', name: 'D', parentUnitId: grade.id })
    await expect(assignStaffToClass({
      organizationId: org.organization.id,
      membershipId: membership.id,
      classUnitId: classroom.id,
      staffRole: 'TEACHING',
    })).resolves.toMatchObject({ staffRole: 'TEACHING' })

    await endMembership({
      organizationId: org.organization.id,
      membershipId: membership.id,
      reason: 'left',
      meta: { actorUserId: owner.id, commandKey: key('staff-end') },
    })
    await expect(assignStaffToClass({
      organizationId: org.organization.id,
      membershipId: membership.id,
      classUnitId: classroom.id,
      staffRole: 'HOMEROOM',
    })).rejects.toMatchObject({ code: 'MEMBERSHIP_NOT_CURRENT' })
  })

  it('rejects cross-tenant structural references directly in PostgreSQL', async () => {
    const ownerA = await createUser('tenant-a')
    const ownerB = await createUser('tenant-b')
    const orgA = await createOrganization({ name: `tenant A ${suffix}`, meta: { actorUserId: ownerA.id, commandKey: key('tenant-a') } })
    const orgB = await createOrganization({ name: `tenant B ${suffix}`, meta: { actorUserId: ownerB.id, commandKey: key('tenant-b') } })
    await grantPersona({ organizationId: orgA.organization.id, membershipId: orgA.membership.id, persona: 'STUDENT', meta: { actorUserId: ownerA.id, commandKey: key('tenant-a-persona') } })
    const gradeB = await createOrganizationUnit({ organizationId: orgB.organization.id, unitKind: 'GRADE', name: 'B grade' })
    const classB = await createOrganizationUnit({ organizationId: orgB.organization.id, unitKind: 'CLASS', name: 'B class', parentUnitId: gradeB.id })

    await expect(db.$executeRawUnsafe(
      `INSERT INTO "organization_student_class_assignments" ("id","organization_id","membership_id","class_unit_id","is_primary") VALUES ($1,$2,$3,$4,TRUE)`,
      randomUUID(), orgA.organization.id, orgA.membership.id, classB.id,
    )).rejects.toBeTruthy()
  })
})
