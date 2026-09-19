import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import {
  createMembership,
  createOrganization,
  setMembershipRole,
} from '../../modules/organization/service'
import { setCourseStudentFrozenState } from '../../services/courseStudentLifecycleService'
import { forceResetPasswordBySystemAdmin } from '../../services/accountAuthorityService'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

let db: PrismaClient
const runSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const commandKey = (label: string) => `account-authority-${label}-${runSuffix}-${randomUUID()}`

async function createUser(
  label: string,
  options: { role?: UserRole; platformRole?: PlatformRole } = {},
) {
  return db.user.create({
    data: {
      username: `account-authority-${label}-${runSuffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: options.role ?? UserRole.STUDENT,
      platformRole: options.platformRole ?? PlatformRole.STANDARD,
    },
    select: { id: true, role: true, platformRole: true },
  })
}

suite('Organization account-authority mutation regressions (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('does not count mustChangePassword ORG_ADMIN as usable', async () => {
    const primary = await createUser('must-change-primary', { role: UserRole.TEACHER })
    const backup = await createUser('must-change-backup', { role: UserRole.TEACHER })
    const created = await createOrganization({
      name: `must change invariant ${runSuffix}`,
      meta: { actorUserId: primary.id, commandKey: commandKey('must-change-create') },
    })
    await createMembership({
      organizationId: created.organization.id,
      userId: backup.id,
      orgRole: 'ORG_ADMIN',
      meta: { actorUserId: primary.id, commandKey: commandKey('must-change-backup') },
    })
    await db.user.update({ where: { id: backup.id }, data: { mustChangePassword: true } })

    await expect(setMembershipRole({
      organizationId: created.organization.id,
      membershipId: created.membership.id,
      orgRole: 'MEMBER',
      meta: { actorUserId: primary.id, commandKey: commandKey('must-change-demote') },
    })).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN', statusCode: 409 })
  })

  it('never lets a Course freeze surface make SYSTEM_ADMIN unusable', async () => {
    const teacher = await createUser('course-teacher', { role: UserRole.TEACHER })
    const systemStudent = await createUser('system-student', {
      role: UserRole.STUDENT,
      platformRole: PlatformRole.SYSTEM_ADMIN,
    })
    const course = await db.course.create({
      data: {
        title: `system admin freeze ${runSuffix}`,
        courseCode: `${Math.floor(100000 + Math.random() * 900000)}`,
        creatorId: teacher.id,
      },
      select: { id: true },
    })
    await db.courseStudent.create({
      data: { courseId: course.id, studentId: systemStudent.id, status: 'ACTIVE' },
    })
    const before = await db.user.findUniqueOrThrow({
      where: { id: systemStudent.id },
      select: { isFrozen: true, tokenVersion: true },
    })

    await expect(setCourseStudentFrozenState({
      actorUserId: teacher.id,
      actorRole: UserRole.TEACHER,
      courseId: course.id,
      studentId: systemStudent.id,
      isFrozen: true,
    })).rejects.toMatchObject({ code: 'SYSTEM_ADMIN_ACCOUNT_PROTECTED', statusCode: 403 })

    await expect(db.user.findUnique({
      where: { id: systemStudent.id },
      select: { isFrozen: true, tokenVersion: true },
    })).resolves.toEqual(before)
  })

  it('requires current SYSTEM_ADMIN for forced reset and preserves last usable ORG_ADMIN', async () => {
    const legacyAdmin = await createUser('legacy-admin', {
      role: UserRole.ADMIN,
      platformRole: PlatformRole.STANDARD,
    })
    const systemActor = await createUser('system-actor', {
      platformRole: PlatformRole.SYSTEM_ADMIN,
    })
    const systemTarget = await createUser('system-target', {
      role: UserRole.STUDENT,
      platformRole: PlatformRole.SYSTEM_ADMIN,
    })
    const systemTargetBefore = await db.user.findUniqueOrThrow({
      where: { id: systemTarget.id },
      select: { mustChangePassword: true, tokenVersion: true, passwordHash: true },
    })

    await expect(forceResetPasswordBySystemAdmin({
      actorUserId: legacyAdmin.id,
      targetUserId: systemTarget.id,
      passwordHash: 'replacement-hash',
    })).rejects.toMatchObject({ code: 'SYSTEM_ADMIN_REQUIRED', statusCode: 403 })

    await expect(db.user.findUnique({
      where: { id: systemTarget.id },
      select: { mustChangePassword: true, tokenVersion: true, passwordHash: true },
    })).resolves.toEqual(systemTargetBefore)

    const primary = await createUser('reset-primary', { role: UserRole.TEACHER })
    const backup = await createUser('reset-backup', { role: UserRole.TEACHER })
    const created = await createOrganization({
      name: `reset invariant ${runSuffix}`,
      meta: { actorUserId: primary.id, commandKey: commandKey('reset-create') },
    })
    await createMembership({
      organizationId: created.organization.id,
      userId: backup.id,
      orgRole: 'ORG_ADMIN',
      meta: { actorUserId: primary.id, commandKey: commandKey('reset-backup') },
    })
    await db.user.update({ where: { id: backup.id }, data: { mustChangePassword: true } })
    const primaryBefore = await db.user.findUniqueOrThrow({
      where: { id: primary.id },
      select: { mustChangePassword: true, tokenVersion: true, passwordHash: true },
    })

    await expect(forceResetPasswordBySystemAdmin({
      actorUserId: systemActor.id,
      targetUserId: primary.id,
      passwordHash: 'replacement-hash',
    })).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN', statusCode: 409 })

    await expect(db.user.findUnique({
      where: { id: primary.id },
      select: { mustChangePassword: true, tokenVersion: true, passwordHash: true },
    })).resolves.toEqual(primaryBefore)
  })
})
