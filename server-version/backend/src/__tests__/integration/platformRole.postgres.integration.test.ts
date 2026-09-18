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

  it('backfills every current legacy ADMIN to SYSTEM_ADMIN exactly once', async () => {
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    })
    expect(admins.length).toBeGreaterThan(0)

    for (const admin of admins) {
      await expect(platformRoleOf(admin.id)).resolves.toBe('SYSTEM_ADMIN')
    }
  })

  it('does not re-promote an explicitly demoted legacy ADMIN on repeated seed', async () => {
    const admin = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    })
    expect(admin).not.toBeNull()

    await prisma.$executeRaw`
      UPDATE "users"
      SET "platform_role" = 'STANDARD'::"PlatformRole"
      WHERE "id" = ${admin!.id}
    `

    const originalUsername = process.env.ADMIN_USERNAME
    const originalPassword = process.env.ADMIN_PASSWORD
    process.env.ADMIN_USERNAME = 'seed-repeat-should-not-create'
    process.env.ADMIN_PASSWORD = 'SeedRepeat123'

    try {
      await seedAdmin(prisma)
      await expect(platformRoleOf(admin!.id)).resolves.toBe('STANDARD')
    } finally {
      await prisma.$executeRaw`
        UPDATE "users"
        SET "platform_role" = 'SYSTEM_ADMIN'::"PlatformRole"
        WHERE "id" = ${admin!.id}
      `
      if (originalUsername === undefined) delete process.env.ADMIN_USERNAME
      else process.env.ADMIN_USERNAME = originalUsername
      if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD
      else process.env.ADMIN_PASSWORD = originalPassword
    }
  })
})
