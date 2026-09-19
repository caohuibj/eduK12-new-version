import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createOrganization } from '../../modules/organization/service'
import {
  createOrganizationUnit,
  deleteOrganizationUnit,
  listOrganizationUnits,
} from '../../modules/organization/structure'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function createUser(label: string) {
  return db.user.create({
    data: {
      username: `org-structure-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.TEACHER,
    },
    select: { id: true },
  })
}

suite('Organization structure tenant invariants (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('creates a two-level Grade/Class hierarchy and preserves deterministic tenant scope', async () => {
    const actor = await createUser('happy')
    const created = await createOrganization({
      name: `structure happy ${suffix}`,
      meta: { actorUserId: actor.id, commandKey: `structure-happy-${randomUUID()}` },
    })
    const grade = await createOrganizationUnit({
      organizationId: created.organization.id,
      unitKind: 'GRADE',
      name: 'Grade 7',
    })
    const classroom = await createOrganizationUnit({
      organizationId: created.organization.id,
      unitKind: 'CLASS',
      name: 'Class 1',
      parentUnitId: grade.id,
    })

    expect(classroom.parentUnitId).toBe(grade.id)
    const units = await listOrganizationUnits(created.organization.id)
    expect(units.map((unit) => unit.id).sort()).toEqual([grade.id, classroom.id].sort())
  })

  it('rejects cross-tenant parents and invalid hierarchy directly at the database layer', async () => {
    const actorA = await createUser('db-a')
    const actorB = await createUser('db-b')
    const orgA = await createOrganization({
      name: `structure db a ${suffix}`,
      meta: { actorUserId: actorA.id, commandKey: `structure-db-a-${randomUUID()}` },
    })
    const orgB = await createOrganization({
      name: `structure db b ${suffix}`,
      meta: { actorUserId: actorB.id, commandKey: `structure-db-b-${randomUUID()}` },
    })
    const gradeA = await createOrganizationUnit({
      organizationId: orgA.organization.id,
      unitKind: 'GRADE',
      name: 'Grade A',
    })
    const gradeB = await createOrganizationUnit({
      organizationId: orgB.organization.id,
      unitKind: 'GRADE',
      name: 'Grade B',
    })
    const classA = await createOrganizationUnit({
      organizationId: orgA.organization.id,
      unitKind: 'CLASS',
      name: 'Class A',
      parentUnitId: gradeA.id,
    })

    await expect(db.$executeRawUnsafe(
      `INSERT INTO "organization_units" ("id","organization_id","unit_kind","name","parent_unit_id") VALUES ($1,$2,'CLASS','cross',$3)`,
      randomUUID(), orgA.organization.id, gradeB.id,
    )).rejects.toBeTruthy()

    await expect(db.$executeRawUnsafe(
      `INSERT INTO "organization_units" ("id","organization_id","unit_kind","name","parent_unit_id") VALUES ($1,$2,'CLASS','missing-parent',NULL)`,
      randomUUID(), orgA.organization.id,
    )).rejects.toBeTruthy()

    await expect(db.$executeRawUnsafe(
      `UPDATE "organization_units" SET "parent_unit_id"=$1 WHERE "id"=$2`,
      classA.id, classA.id,
    )).rejects.toBeTruthy()

    await expect(db.$executeRawUnsafe(
      `UPDATE "organization_units" SET "parent_unit_id"=$1 WHERE "id"=$2`,
      classA.id, gradeA.id,
    )).rejects.toBeTruthy()
  })

  it('uses RESTRICT so referenced Grades cannot be erased with their history', async () => {
    const actor = await createUser('restrict')
    const created = await createOrganization({
      name: `structure restrict ${suffix}`,
      meta: { actorUserId: actor.id, commandKey: `structure-restrict-${randomUUID()}` },
    })
    const grade = await createOrganizationUnit({
      organizationId: created.organization.id,
      unitKind: 'GRADE',
      name: 'Grade 8',
    })
    await createOrganizationUnit({
      organizationId: created.organization.id,
      unitKind: 'CLASS',
      name: 'Class 2',
      parentUnitId: grade.id,
    })

    await expect(deleteOrganizationUnit({
      organizationId: created.organization.id,
      unitId: grade.id,
    })).rejects.toMatchObject({ code: 'UNIT_REFERENCED', statusCode: 409 })
  })
})
