import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ParentRelationshipStatus, PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import organizationRoutes from '../../modules/organization/organization.routes'
import { csrfProtection } from '../../middleware/csrf'
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../utils/authCookies'
import { generateToken } from '../../utils/jwt'
import {
  createMembership,
  createOrganization,
  denyOrganizationAccess,
  endMembership,
} from '../../modules/organization/service'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

let db: PrismaClient
let server: Server
let baseUrl = ''
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const commandKey = (label: string) => `org-pr5-context-${label}-${suffix}-${randomUUID()}`

type TestUser = {
  id: string
  username: string
  role: UserRole
  platformRole: PlatformRole
  tokenVersion: number
}

async function createUser(
  label: string,
  role: UserRole = UserRole.STUDENT,
  platformRole: PlatformRole = PlatformRole.STANDARD,
): Promise<TestUser> {
  return db.user.create({
    data: {
      username: `org-pr5-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
      platformRole,
    },
    select: { id: true, username: true, role: true, platformRole: true, tokenVersion: true },
  })
}

const authHeaders = (user: TestUser, csrf = `csrf-${suffix}`): Record<string, string> => {
  const token = generateToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion,
  })
  return {
    cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(csrf)}`,
    [CSRF_HEADER_NAME]: csrf,
    'content-type': 'application/json',
  }
}

async function jsonRequest(path: string, user: TestUser) {
  const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders(user) })
  return { status: response.status, body: await response.json() as Record<string, any> }
}

suite('PR5 Organization product context HTTP gate (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()

    const app = express()
    app.use(express.json())
    app.use('/api', csrfProtection)
    app.use('/api/organizations', organizationRoutes)
    server = createServer(app)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Organization product context server did not bind TCP')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    await db.$disconnect()
  })

  it('lists only current direct memberships for STANDARD and hides cross-Organization context', async () => {
    const ownerA = await createUser('owner-a', UserRole.TEACHER)
    const ownerB = await createUser('owner-b', UserRole.TEACHER)
    const member = await createUser('member')
    const orgA = await createOrganization({
      name: `PR5 member org A ${suffix}`,
      meta: { actorUserId: ownerA.id, commandKey: commandKey('org-a') },
    })
    const orgB = await createOrganization({
      name: `PR5 member org B ${suffix}`,
      meta: { actorUserId: ownerB.id, commandKey: commandKey('org-b') },
    })
    const membership = await createMembership({
      organizationId: orgA.organization.id,
      userId: member.id,
      meta: { actorUserId: ownerA.id, commandKey: commandKey('member-a') },
    })

    const listed = await jsonRequest('/api/organizations?page=1&pageSize=100', member)
    expect(listed.status).toBe(200)
    expect(listed.body.data.platformRole).toBe('STANDARD')
    expect(listed.body.data.list.map((row: any) => row.id)).toContain(orgA.organization.id)
    expect(listed.body.data.list.map((row: any) => row.id)).not.toContain(orgB.organization.id)
    expect(listed.body.data.list.find((row: any) => row.id === orgA.organization.id)?.scopeBasis).toBe('MEMBERSHIP')

    const ownContext = await jsonRequest(`/api/organizations/${orgA.organization.id}/context`, member)
    expect(ownContext.status).toBe(200)
    expect(ownContext.body.data.access.membershipId).toBe(membership.id)
    expect(ownContext.body.data.access.basis).toContain('MEMBERSHIP')
    expect(ownContext.body.data.access.platformRole).toBe('STANDARD')

    const guessedContext = await jsonRequest(`/api/organizations/${orgB.organization.id}/context`, member)
    expect(guessedContext.status).toBe(404)

    await endMembership({
      organizationId: orgA.organization.id,
      membershipId: membership.id,
      reason: 'PR5 context revocation check',
      meta: { actorUserId: ownerA.id, commandKey: commandKey('member-end') },
    })

    const afterEnd = await jsonRequest('/api/organizations?page=1&pageSize=100', member)
    expect(afterEnd.body.data.list.map((row: any) => row.id)).not.toContain(orgA.organization.id)
    const endedContext = await jsonRequest(`/api/organizations/${orgA.organization.id}/context`, member)
    expect(endedContext.status).toBe(404)
  })

  it('does not promote Parent relationship evidence into Organization membership discovery', async () => {
    const owner = await createUser('parent-owner', UserRole.TEACHER)
    const parent = await createUser('parent', UserRole.PARENT)
    const child = await createUser('child', UserRole.STUDENT)
    const created = await createOrganization({
      name: `PR5 parent boundary ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('parent-org') },
    })
    await createMembership({
      organizationId: created.organization.id,
      userId: child.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('parent-child-membership') },
    })
    await db.parentStudentRelationship.create({
      data: {
        parentUserId: parent.id,
        studentUserId: child.id,
        status: ParentRelationshipStatus.ACTIVE,
        approvedByUserId: owner.id,
        approvedAt: new Date(),
      },
    })

    const listed = await jsonRequest('/api/organizations?page=1&pageSize=100', parent)
    expect(listed.status).toBe(200)
    expect(listed.body.data.list.map((row: any) => row.id)).not.toContain(created.organization.id)
    const context = await jsonRequest(`/api/organizations/${created.organization.id}/context`, parent)
    expect(context.status).toBe(404)
  })

  it('projects SYSTEM_ADMIN scope without synthetic membership and preserves explicit deny precedence', async () => {
    const owner = await createUser('system-owner', UserRole.TEACHER)
    const systemAdmin = await createUser('system-admin', UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
    const created = await createOrganization({
      name: `PR5 system admin ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('system-org') },
    })

    const listed = await jsonRequest('/api/organizations?page=1&pageSize=100', systemAdmin)
    expect(listed.status).toBe(200)
    expect(listed.body.data.platformRole).toBe('SYSTEM_ADMIN')
    // Shared integration databases can contain more than one page after reruns.
    let rows = listed.body.data.list
    for (let page = 2; !rows.some((row: any) => row.id === created.organization.id) && (page - 1) * 100 < listed.body.data.total; page++) {
      const next = await jsonRequest(`/api/organizations?page=${page}&pageSize=100`, systemAdmin)
      expect(next.status).toBe(200)
      rows = [...rows, ...next.body.data.list]
    }
    expect(rows.find((row: any) => row.id === created.organization.id)?.scopeBasis).toBe('SYSTEM_ADMIN')

    const beforeDeny = await jsonRequest(`/api/organizations/${created.organization.id}/context`, systemAdmin)
    expect(beforeDeny.status).toBe(200)
    expect(beforeDeny.body.data.access.membershipId).toBeNull()
    expect(beforeDeny.body.data.access.basis).toContain('SYSTEM_ADMIN')
    expect(beforeDeny.body.data.access.canGovern).toBe(true)

    await denyOrganizationAccess({
      organizationId: created.organization.id,
      userId: systemAdmin.id,
      permission: 'ORGANIZATION_GOVERNANCE',
      reason: 'PR5 explicit deny projection check',
      meta: { actorUserId: systemAdmin.id, commandKey: commandKey('system-deny') },
    })

    const afterDeny = await jsonRequest(`/api/organizations/${created.organization.id}/context`, systemAdmin)
    expect(afterDeny.status).toBe(200)
    expect(afterDeny.body.data.access.explicitDenies).toContain('ORGANIZATION_GOVERNANCE')
    expect(afterDeny.body.data.access.canGovern).toBe(false)
  })
})
