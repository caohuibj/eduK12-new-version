import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import organizationRoutes from '../../modules/organization/organization.routes'
import { csrfProtection } from '../../middleware/csrf'
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../utils/authCookies'
import { generateToken } from '../../utils/jwt'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'

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
const commandKey = (label: string) => `org-pr5-admin-${label}-${suffix}-${randomUUID()}`

type TestUser = {
  id: string
  username: string
  role: UserRole
  tokenVersion: number
}

async function createUser(label: string, role: UserRole = UserRole.STUDENT): Promise<TestUser> {
  return db.user.create({
    data: {
      username: `org-pr5-admin-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
    },
    select: { id: true, username: true, role: true, tokenVersion: true },
  })
}

const authHeaders = (user: TestUser, csrf = `csrf-${suffix}`): Record<string, string> => ({
  cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(generateToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion,
  }))}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(csrf)}`,
  [CSRF_HEADER_NAME]: csrf,
  'content-type': 'application/json',
})

async function jsonRequest(path: string, input: {
  user: TestUser
  method?: string
  body?: unknown
}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? 'GET',
    headers: authHeaders(input.user),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
  return { status: response.status, body: await response.json() as Record<string, any> }
}

suite('PR5 Organization administration adapters (real PostgreSQL)', () => {
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
    if (!address || typeof address === 'string') throw new Error('Organization admin test server did not bind TCP')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    await db.$disconnect()
  })

  it('exposes governed Grade/Class structure and preserves relationship episodes', async () => {
    const owner = await createUser('owner', UserRole.TEACHER)
    const student = await createUser('student')
    const teacher = await createUser('teacher', UserRole.TEACHER)
    const outsider = await createUser('outsider')
    const created = await createOrganization({
      name: `PR5 admin ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('create-org') },
    })
    const studentMembership = await createMembership({
      organizationId: created.organization.id,
      userId: student.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('student-membership') },
    })
    const teacherMembership = await createMembership({
      organizationId: created.organization.id,
      userId: teacher.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('teacher-membership') },
    })
    await grantPersona({
      organizationId: created.organization.id,
      membershipId: studentMembership.id,
      persona: 'STUDENT',
      meta: { actorUserId: owner.id, commandKey: commandKey('student-persona') },
    })
    await grantPersona({
      organizationId: created.organization.id,
      membershipId: teacherMembership.id,
      persona: 'TEACHER',
      meta: { actorUserId: owner.id, commandKey: commandKey('teacher-persona') },
    })

    const denied = await jsonRequest(`/api/organizations/${created.organization.id}/units`, { user: outsider })
    expect(denied.status).toBe(403)

    const grade = await jsonRequest(`/api/organizations/${created.organization.id}/units`, {
      user: owner,
      method: 'POST',
      body: { unitKind: 'GRADE', name: 'Grade 9' },
    })
    expect(grade.status).toBe(200)
    expect(grade.body.data.unitKind).toBe('GRADE')

    const classroom = await jsonRequest(`/api/organizations/${created.organization.id}/units`, {
      user: owner,
      method: 'POST',
      body: { unitKind: 'CLASS', name: 'Class A', parentUnitId: grade.body.data.id },
    })
    expect(classroom.status).toBe(200)
    expect(classroom.body.data.parentUnitId).toBe(grade.body.data.id)

    const units = await jsonRequest(`/api/organizations/${created.organization.id}/units`, { user: owner })
    expect(units.status).toBe(200)
    expect(units.body.data.list.map((row: any) => row.id)).toEqual(expect.arrayContaining([
      grade.body.data.id,
      classroom.body.data.id,
    ]))

    const studentAssignment = await jsonRequest(`/api/organizations/${created.organization.id}/student-class-assignments`, {
      user: owner,
      method: 'POST',
      body: { membershipId: studentMembership.id, classUnitId: classroom.body.data.id, isPrimary: true },
    })
    expect(studentAssignment.status).toBe(200)
    expect(studentAssignment.body.data.membershipId).toBe(studentMembership.id)

    const staffAssignment = await jsonRequest(`/api/organizations/${created.organization.id}/staff-class-assignments`, {
      user: owner,
      method: 'POST',
      body: { membershipId: teacherMembership.id, classUnitId: classroom.body.data.id, staffRole: 'TEACHING' },
    })
    expect(staffAssignment.status).toBe(200)
    expect(staffAssignment.body.data.staffRole).toBe('TEACHING')

    const currentStudents = await jsonRequest(
      `/api/organizations/${created.organization.id}/student-class-assignments?currentOnly=true`,
      { user: owner },
    )
    expect(currentStudents.status).toBe(200)
    expect(currentStudents.body.data.list.map((row: any) => row.id)).toContain(studentAssignment.body.data.id)

    const ended = await jsonRequest(
      `/api/organizations/${created.organization.id}/student-class-assignments/${studentAssignment.body.data.id}/end`,
      { user: owner, method: 'POST' },
    )
    expect(ended.status).toBe(200)
    expect(ended.body.data.validUntil).not.toBeNull()

    const currentAfterEnd = await jsonRequest(
      `/api/organizations/${created.organization.id}/student-class-assignments?currentOnly=true`,
      { user: owner },
    )
    expect(currentAfterEnd.body.data.list.map((row: any) => row.id)).not.toContain(studentAssignment.body.data.id)

    const history = await jsonRequest(
      `/api/organizations/${created.organization.id}/student-class-assignments`,
      { user: owner },
    )
    expect(history.body.data.list.find((row: any) => row.id === studentAssignment.body.data.id)?.validUntil).toBeTruthy()

    const accessHistory = await jsonRequest(
      `/api/organizations/${created.organization.id}/memberships/${studentMembership.id}/access-history`,
      { user: owner },
    )
    expect(accessHistory.status).toBe(200)
    expect(accessHistory.body.data.membership.id).toBe(studentMembership.id)
    expect(accessHistory.body.data.personas.some((row: any) => row.persona === 'STUDENT' && row.revokedAt === null)).toBe(true)
  })
  it('keeps classification, professional relations and audit within the governed tenant', async () => {
    const owner = await createUser('classification-owner')
    const client = await createUser('client')
    const foreign = await createUser('foreign')
    const created = await createOrganization({ name: 'classification test', meta: { actorUserId: owner.id, commandKey: commandKey('classification') } })
    const other = await createOrganization({ name: 'foreign classification', meta: { actorUserId: foreign.id, commandKey: commandKey('foreign') } })
    const membership = await createMembership({ organizationId: created.organization.id, userId: client.id, meta: { actorUserId: owner.id, commandKey: commandKey('client') } })
    const path = `/api/organizations/${created.organization.id}/classification`
    const command = (body: unknown) => jsonRequest(path, { user: owner, method: 'POST', body })
    expect((await jsonRequest(path, { user: client })).status).toBe(403)
    const dimension = await command({ operation: 'CREATE_DIMENSION', key: 'dept', name: '部门', cardinality: 'SINGLE' })
    expect(dimension.status).toBe(200)
    const label = await command({ operation: 'CREATE_LABEL', dimensionId: dimension.body.data.id, name: 'A' })
    const second = await command({ operation: 'CREATE_LABEL', dimensionId: dimension.body.data.id, name: 'B' })
    expect(label.status).toBe(200)
    const assigned = await command({ operation: 'ASSIGN_LABEL', membershipId: membership.id, labelId: label.body.data.id })
    expect(assigned.status).toBe(200)
    expect((await command({ operation: 'ASSIGN_LABEL', membershipId: membership.id, labelId: second.body.data.id })).status).toBe(409)
    expect((await command({ operation: 'ASSIGN_LABEL', membershipId: other.membership.id, labelId: label.body.data.id })).status).toBe(404)
    expect((await command({ operation: 'END_LABEL', assignmentId: assigned.body.data.id })).status).toBe(200)
    expect((await command({ operation: 'CREATE_RELATIONSHIP', counselorMembershipId: created.membership.id, clientMembershipId: membership.id })).status).not.toBe(200)
    for (const [membershipId, persona] of [[created.membership.id, 'COUNSELOR'], [membership.id, 'CLIENT']] as const) {
      await grantPersona({ organizationId: created.organization.id, membershipId, persona, meta: { actorUserId: owner.id, commandKey: commandKey(persona) } })
    }
    const relation = await command({ operation: 'CREATE_RELATIONSHIP', counselorMembershipId: created.membership.id, clientMembershipId: membership.id })
    expect(relation.status).toBe(200)
    expect((await command({ operation: 'END_RELATIONSHIP', relationshipId: relation.body.data.id })).status).toBe(200)
    const history = await jsonRequest(path, { user: owner })
    expect(history.body.data.assignments[0].validUntil).toBeTruthy()
    expect(history.body.data.relationships[0].validUntil).toBeTruthy()
    const audit = await jsonRequest(`/api/organizations/${created.organization.id}/audit`, { user: owner })
    expect(audit.status).toBe(200)
    expect(audit.body.data.list.some((item: any) => item.action === 'ORGANIZATION_CREATED')).toBe(true)
  })

  it('requires current platform authority for lifecycle and atomically creates the selected first admin', async () => {
    const user = await createUser('platform-lifecycle')
    const firstAdmin = await createUser('first-admin')
    const path = '/api/organizations'
    const body = { name: 'Platform organization', firstAdminUserId: firstAdmin.id, commandKey: commandKey('platform-create') }
    expect((await jsonRequest(path, { user, method: 'POST', body })).status).toBe(403)
    await db.user.update({ where: { id: user.id }, data: { platformRole: 'SYSTEM_ADMIN' } })
    const created = await jsonRequest(path, { user, method: 'POST', body })
    expect(created.status).toBe(200)
    expect(created.body.data.membership.userId).toBe(firstAdmin.id)
    const id = created.body.data.organization.id
    expect((await jsonRequest(`${path}/${id}/suspend`, { user: firstAdmin, method: 'POST', body: { commandKey: commandKey('bad-suspend') } })).status).toBe(403)
    expect((await jsonRequest(`${path}/${id}/suspend`, { user, method: 'POST', body: { commandKey: commandKey('suspend') } })).status).toBe(200)
    const context = await jsonRequest(`${path}/${id}/context`, { user: firstAdmin })
    expect(context.body.data.allowedActions).not.toContain('RESUME')
    expect(context.body.data.access.canGovern).toBe(false)
    expect((await jsonRequest(`${path}/${id}/classification`, { user: firstAdmin })).status).toBe(403)
    expect((await jsonRequest(`${path}/${id}/resume`, { user: firstAdmin, method: 'POST', body: { commandKey: commandKey('bad-resume') } })).status).toBe(403)
    expect((await jsonRequest(`${path}/${id}/resume`, { user, method: 'POST', body: { commandKey: commandKey('resume') } })).status).toBe(200)
    await db.user.update({ where: { id: user.id }, data: { platformRole: 'STANDARD' } })
    expect((await jsonRequest(path, { user, method: 'POST', body: { ...body, commandKey: commandKey('demoted') } })).status).toBe(403)
  })

})
