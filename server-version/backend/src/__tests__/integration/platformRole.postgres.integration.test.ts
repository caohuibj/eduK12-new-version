import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { seedAdmin } from '../../../prisma/seeds/users'
import { integrationDatabaseUrl } from './integration-env'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient

async function platformRoleOf(userId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ platformRole: string }>>`
    SELECT "platform_role"::text AS "platformRole"
    FROM "users"
    WHERE "id" = ${userId}
  `
  return rows[0]?.platformRole ?? null
}

async function legacySystemAdminId(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "users"
    WHERE "role" = 'ADMIN'
      AND "platform_role" = 'SYSTEM_ADMIN'::"PlatformRole"
    ORDER BY "created_at" ASC, "id" ASC
    LIMIT 1
  `
  return rows[0]?.id ?? null
}

suite('platform role migration and seed invariants (real PostgreSQL)', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('defaults newly created non-platform users to STANDARD', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
      data: {
        username: `platform-role-standard-${suffix}`,
        passwordHash: 'test-only',
        role: UserRole.TEACHER,
      },
      select: { id: true },
    })

    try {
      await expect(platformRoleOf(user.id)).resolves.toBe('STANDARD')
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
  })

  it('keeps bootstrap/backfilled authority explicit and does not infer later legacy ADMINs', async () => {
    // CI seeds one bootstrap administrator after migrations. Upgrade installs
    // may instead reach this state through the one-time migration backfill.
    // Either way, at least one legacy ADMIN is explicitly SYSTEM_ADMIN.
    const explicitSystemAdmin = await legacySystemAdminId()
    expect(explicitSystemAdmin).not.toBeNull()
    await expect(platformRoleOf(explicitSystemAdmin!)).resolves.toBe('SYSTEM_ADMIN')

    // A legacy ADMIN created after the migration is *not* automatically a
    // platform administrator. This is the key non-inference invariant.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const laterAdmin = await prisma.user.create({
      data: {
        username: `platform-role-later-admin-${suffix}`,
        passwordHash: 'test-only',
        role: UserRole.ADMIN,
      },
      select: { id: true },
    })
    try {
      await expect(platformRoleOf(laterAdmin.id)).resolves.toBe('STANDARD')
    } finally {
      await prisma.user.delete({ where: { id: laterAdmin.id } })
    }
  })

  it('does not re-promote an explicitly demoted legacy ADMIN on repeated seed', async () => {
    const adminId = await legacySystemAdminId()
    expect(adminId).not.toBeNull()

    await prisma.$executeRaw`
      UPDATE "users"
      SET "platform_role" = 'STANDARD'::"PlatformRole"
      WHERE "id" = ${adminId!}
    `

    const originalUsername = process.env.ADMIN_USERNAME
    const originalPassword = process.env.ADMIN_PASSWORD
    process.env.ADMIN_USERNAME = 'seed-repeat-should-not-create'
    process.env.ADMIN_PASSWORD = 'SeedRepeat123'

    try {
      await seedAdmin(prisma)
      await expect(platformRoleOf(adminId!)).resolves.toBe('STANDARD')
    } finally {
      // Restore the CI bootstrap authority because the integration database is
      // shared by the remaining serial suites in this job.
      await prisma.$executeRaw`
        UPDATE "users"
        SET "platform_role" = 'SYSTEM_ADMIN'::"PlatformRole"
        WHERE "id" = ${adminId!}
      `
      if (originalUsername === undefined) delete process.env.ADMIN_USERNAME
      else process.env.ADMIN_USERNAME = originalUsername
      if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD
      else process.env.ADMIN_PASSWORD = originalPassword
    }
  })
})
