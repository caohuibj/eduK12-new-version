import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { resolveOrganizationAccessContext } from '../../modules/organization/access'
import { loadCurrentPrincipal } from '../../modules/organization/principal'
import {
  createMembership,
  createOrganization,
  denyOrganizationAccess,
  endMembership,
  liftOrganizationAccessDeny,
  setMembershipRole,
} from '../../modules/organization/service'
import { setUserActiveState } from '../../services/userLifecycleService'
import { setCourseStudentFrozenState } from '../../services/courseStudentLifecycleService'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

let db: PrismaClient
const runSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const commandKey = (label: string) => `org-review-${label}-${runSuffix}-${randomUUID()}`

async function createUser(
  label: string,
  options: { role?: UserRole; platformRole?: PlatformRole } = {},
) {
  return db.user.create({
    data: {
      username: `org-review-${label}-${runSuffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: options.role ?? UserRole.STUDENT,
      platformRole: options.platformRole ?? PlatformRole.STANDARD,
    },
    select: { id: true, role: true, platformRole: true },
  })
}

suite('Organization PR1 review regressions (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('uses current PlatformRole for account lifecycle instead of legacy ADMIN', async () => {
    const legacyAdmin = await createUser('legacy-admin', {
      role: UserRole.ADMIN,
      platformRole: PlatformRole.STANDARD,
    })
    const systemActor = await createUser('system-actor', {
      role: UserRole.STUDENT,
      platformRole: PlatformRole.SYSTEM_ADMIN,
    })
    const systemTarget = await createUser('system-target', {
      role: UserRole.ADMIN,
      platformRole: PlatformRole.SYSTEM_ADMIN,
    })

    await expect(setUserActiveState({
      actorUserId: legacyAdmin.id,
      targetUserId: systemTarget.id,
      isActive: false,
    })).rejects.toMatchObject({ code: 'SYSTEM_ADMIN_REQUIRED', statusCode: 403 })

    await expect(db.user.findUnique({
      where: { id: systemTarget.id },
      select: { isActive: true },
    })).resolves.toEqual({ isActive: true })

    await expect(setUserActiveState({
      actorUserId: systemActor.id,
      targetUserId: systemTarget.id,
      isActive: false,
    })).resolves.toEqual({ id: systemTarget.id, isActive: false })
  })

  it('blocks demote and membership end when every alternative ORG_ADMIN account is unusable', async () => {
    const primary = await createUser('usable-primary', { role: UserRole.TEACHER })
    const backup = await createUser('usable-backup', { role: UserRole.TEACHER })
    const created = await createOrganization({
      name: `usable admin ${runSuffix}`,
      meta: { actorUserId: primary.id, commandKey: commandKey('usable-create') },
    })
    await createMembership({
      organizationId: created.organization.id,
      userId: backup.id,
      orgRole: 'ORG_ADMIN',
      meta: { actorUserId: primary.id, commandKey: commandKey('usable-backup') },
    })

    await db.user.update({ where: { id: backup.id }, data: { isActive: false } })
    await expect(setMembershipRole({
      organizationId: created.organization.id,
      membershipId: created.membership.id,
      orgRole: 'MEMBER',
      meta: { actorUserId: primary.id, commandKey: commandKey('usable-demote') },
    })).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN', statusCode: 409 })

    await db.user.update({
      where: { id: backup.id },
      data: { isActive: true, isFrozen: true },
    })
    await expect(endMembership({
      organizationId: created.organization.id,
      membershipId: created.membership.id,
      reason: 'must retain usable admin',
      meta: { actorUserId: primary.id, commandKey: commandKey('usable-end') },
    })).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN', statusCode: 409 })
  })

  it('uses the same usable-admin invariant for account deactivation', async () => {
    const systemActor = await createUser('deactivate-system', {
      platformRole: PlatformRole.SYSTEM_ADMIN,
    })
    const primary = await createUser('deactivate-primary', { role: UserRole.TEACHER })
    const backup = await createUser('deactivate-backup', { role: UserRole.TEACHER })
    const created = await createOrganization({
      name: `deactivate invariant ${runSuffix}`,
      meta: { actorUserId: primary.id, commandKey: commandKey('deactivate-create') },
    })
    await createMembership({
      organizationId: created.organization.id,
      userId: backup.id,
      orgRole: 'ORG_ADMIN',
      meta: { actorUserId: primary.id, commandKey: commandKey('deactivate-backup') },
    })
    await db.user.update({ where: { id: backup.id }, data: { isActive: false } })

    await expect(setUserActiveState({
      actorUserId: systemActor.id,
      targetUserId: primary.id,
      isActive: false,
    })).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN', statusCode: 409 })

    await expect(db.user.findUnique({
      where: { id: primary.id },
      select: { isActive: true },
    })).resolves.toEqual({ isActive: true })
  })

  it('routes admin-authorized course freezing through the same usable-admin invariant', async () => {
    const teacher = await createUser('freeze-teacher', { role: UserRole.TEACHER })
    const admin = await createUser('freeze-admin', { role: UserRole.ADMIN })
    const primary = await createUser('freeze-primary', { role: UserRole.STUDENT })
    const backup = await createUser('freeze-backup', { role: UserRole.TEACHER })
    const created = await createOrganization({
      name: `freeze invariant ${runSuffix}`,
      meta: { actorUserId: primary.id, commandKey: commandKey('freeze-create-org') },
    })
    await createMembership({
      organizationId: created.organization.id,
      userId: backup.id,
      orgRole: 'ORG_ADMIN',
      meta: { actorUserId: primary.id, commandKey: commandKey('freeze-backup') },
    })
    await db.user.update({ where: { id: backup.id }, data: { isActive: false } })

    const course = await db.course.create({
      data: {
        title: `freeze review ${runSuffix}`,
        courseCode: `${Math.floor(100000 + Math.random() * 900000)}`,
        creatorId: teacher.id,
      },
      select: { id: true },
    })
    await db.courseStudent.create({
      data: {
        courseId: course.id,
        studentId: primary.id,
        status: 'ACTIVE',
      },
    })

    await expect(setCourseStudentFrozenState({
      actorUserId: admin.id,
      actorRole: UserRole.ADMIN,
      courseId: course.id,
      studentId: primary.id,
      isFrozen: true,
    })).rejects.toMatchObject({ code: 'LAST_ORG_ADMIN', statusCode: 409 })

    await expect(db.user.findUnique({
      where: { id: primary.id },
      select: { isFrozen: true },
    })).resolves.toEqual({ isFrozen: false })
  })

  it('prevents ORG_ADMIN from denying SYSTEM_ADMIN and permits SYSTEM_ADMIN recovery', async () => {
    const orgAdmin = await createUser('deny-org-admin', { role: UserRole.TEACHER })
    const systemAdmin = await createUser('deny-system-admin', {
      platformRole: PlatformRole.SYSTEM_ADMIN,
    })
    const created = await createOrganization({
      name: `deny recovery ${runSuffix}`,
      meta: { actorUserId: orgAdmin.id, commandKey: commandKey('deny-create') },
    })

    await expect(denyOrganizationAccess({
      organizationId: created.organization.id,
      userId: systemAdmin.id,
      permission: 'ORGANIZATION_GOVERNANCE',
      reason: 'tenant admin must not revoke platform recovery',
      meta: { actorUserId: orgAdmin.id, commandKey: commandKey('deny-tenant-attempt') },
    })).rejects.toMatchObject({
      code: 'PLATFORM_DENY_REQUIRES_SYSTEM_ADMIN',
      statusCode: 403,
    })

    await denyOrganizationAccess({
      organizationId: created.organization.id,
      userId: systemAdmin.id,
      permission: 'ORGANIZATION_GOVERNANCE',
      reason: 'platform-controlled deny test',
      meta: { actorUserId: systemAdmin.id, commandKey: commandKey('deny-platform') },
    })

    const deniedPrincipal = await loadCurrentPrincipal(systemAdmin.id)
    const deniedContext = await resolveOrganizationAccessContext({
      principal: deniedPrincipal!,
      organizationId: created.organization.id,
    })
    expect(deniedContext?.canGovern).toBe(false)

    await expect(liftOrganizationAccessDeny({
      organizationId: created.organization.id,
      userId: systemAdmin.id,
      permission: 'ORGANIZATION_GOVERNANCE',
      meta: { actorUserId: systemAdmin.id, commandKey: commandKey('deny-platform-lift') },
    })).resolves.toEqual({ lifted: true })

    const recoveredContext = await resolveOrganizationAccessContext({
      principal: deniedPrincipal!,
      organizationId: created.organization.id,
    })
    expect(recoveredContext?.canGovern).toBe(true)
  })

  it('writes an explicit audit and receipt for no-op role commands', async () => {
    const actor = await createUser('noop-actor', { role: UserRole.TEACHER })
    const created = await createOrganization({
      name: `noop audit ${runSuffix}`,
      meta: { actorUserId: actor.id, commandKey: commandKey('noop-create') },
    })
    const key = commandKey('noop-role')

    const unchanged = await setMembershipRole({
      organizationId: created.organization.id,
      membershipId: created.membership.id,
      orgRole: 'ORG_ADMIN',
      meta: { actorUserId: actor.id, commandKey: key },
    })
    expect(unchanged.orgRole).toBe('ORG_ADMIN')

    const [audits, receipts] = await Promise.all([
      db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "organization_governance_audits"
        WHERE "organization_id" = ${created.organization.id}
          AND "action" = 'MEMBERSHIP_ROLE_UNCHANGED'
          AND "target_id" = ${created.membership.id}
      `,
      db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "organization_command_receipts"
        WHERE "organization_id" = ${created.organization.id}
          AND "actor_user_id" = ${actor.id}
          AND "command_key" = ${key}
      `,
    ])
    expect(audits[0]?.count).toBe(1)
    expect(receipts[0]?.count).toBe(1)
  })
})
