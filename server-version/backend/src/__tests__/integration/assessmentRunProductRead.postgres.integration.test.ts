import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { authenticate } from '../../middleware/auth'
import { runOrLegacyRespondentAccess } from '../../modules/assessment-run/runtimeAccess'
import organizationRoutes from '../../modules/organization/organization.routes'
import { csrfProtection } from '../../middleware/csrf'
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../utils/authCookies'
import { generateToken } from '../../utils/jwt'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { previewAssessmentRun, publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

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
const commandKey = (label: string) => `org-pr5-run-${label}-${suffix}-${randomUUID()}`

const requestedPolicy = {
  subjectRoles: ['STUDENT'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'ORG_SELF_V1',
  minimumRespondents: null,
}

const resourceAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB',
    startMode: 'TRANSACTIONAL',
    supportsLookupByOperationKey: false,
    supportsSafeCancel: true,
    finalAuthority: 'CANONICAL_RUNTIME',
    runtimeBindingKind: 'COMPOSITE',
    runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family,
      key: ref.key,
      version: ref.version,
      scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, applicability: requestedPolicy }),
      ...requestedPolicy,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'pr5-product-run' },
    }
  },
}
const registry = new RunResourceAuthorityRegistry([resourceAdapter])

type TestUser = { id: string; username: string; role: UserRole; tokenVersion: number }
async function createUser(label: string, role: UserRole = UserRole.STUDENT): Promise<TestUser> {
  return db.user.create({
    data: {
      username: `org-pr5-run-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
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

async function jsonRequest(path: string, user: TestUser) {
  const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders(user) })
  return { status: response.status, body: await response.json() as Record<string, any> }
}

suite('PR5 Run product read models (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
    const app = express()
    app.use(express.json())
    app.use('/api', csrfProtection)
    app.use('/api/organizations', organizationRoutes)
    app.get('/api/runtime-probe/:attemptId', authenticate, runOrLegacyRespondentAccess('COMPOSITE'), (_req, res) => res.json({ allowed: true }))
    server = createServer(app)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Run product test server did not bind TCP')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    await db.$disconnect()
  })

  it('lists and reads frozen Run facts without exposing a second state model', async () => {
    const owner = await createUser('owner', UserRole.TEACHER)
    const student = await createUser('student')
    const outsider = await createUser('outsider')
    const created = await createOrganization({
      name: `PR5 Run ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('org') },
    })
    const member = await createMembership({
      organizationId: created.organization.id,
      userId: student.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('student') },
    })
    await grantPersona({
      organizationId: created.organization.id,
      membershipId: member.id,
      persona: 'STUDENT',
      meta: { actorUserId: owner.id, commandKey: commandKey('student-persona') },
    })

    const run = await createAssessmentRunDraft({
      organizationId: created.organization.id,
      name: `Pilot cohort ${suffix}`,
      createdByUserId: owner.id,
    })
    await addAssessmentRunTrackDraft({
      organizationId: created.organization.id,
      runId: run.id,
      resource: { family: 'BUNDLE', key: `pr5-bundle-${suffix}`, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [member.id] },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [member.id] },
      requestedPolicy,
    })
    const preview = await previewAssessmentRun({ organizationId: created.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
    expect(preview.tracks[0]).toMatchObject({ subjectCount: 1, respondentCount: 1, executionCount: 1 })
    const beforePublish = await jsonRequest(`/api/organizations/${created.organization.id}/runs/${run.id}`, owner)
    expect(beforePublish.body.data.run.executionCount).toBe(0)
    expect(beforePublish.body.data.run.status).toBe('DRAFT')
    await expect(previewAssessmentRun({ organizationId: created.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 1, resourceRegistry: registry })).rejects.toMatchObject({ code: 'RUN_STATE_CONFLICT' })
    await publishAssessmentRun({
      organizationId: created.organization.id,
      runId: run.id,
      actorUserId: owner.id,
      expectedVersion: 2,
      resourceRegistry: registry,
    })

    const denied = await jsonRequest(`/api/organizations/${created.organization.id}/runs`, outsider)
    expect(denied.status).toBe(403)

    const list = await jsonRequest(`/api/organizations/${created.organization.id}/runs?status=PUBLISHED`, owner)
    expect(list.status).toBe(200)
    expect(list.body.data.total).toBeGreaterThanOrEqual(1)
    expect(list.body.data.list.find((item: any) => item.id === run.id)).toMatchObject({
      status: 'PUBLISHED',
      trackCount: 1,
      executionCount: 1,
    })

    const detail = await jsonRequest(`/api/organizations/${created.organization.id}/runs/${run.id}`, owner)
    expect(detail.status).toBe(200)
    expect(detail.body.data.run).toMatchObject({ id: run.id, status: 'PUBLISHED', version: 3 })
    expect(detail.body.data.tracks).toHaveLength(1)
    expect(detail.body.data.tracks[0].resourcePolicyHash).toEqual(expect.any(String))
    expect(detail.body.data.tracks[0].frozenResourcePolicy).toBeTruthy()
    expect(detail.body.data.frozenPopulation.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ provenanceKind: 'ORG_MEMBER', actorRole: 'STUDENT', count: 1 }),
    ]))
    expect(detail.body.data.frozenPopulation.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ relationshipKind: 'SELF', count: 1 }),
    ]))
    expect(detail.body.data.executions).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'ASSIGNED', count: 1 }),
    ]))
    const tasks = await jsonRequest('/api/organizations/assigned-tasks', student)
    expect(tasks.status).toBe(200)
    expect(tasks.body.data.list.some((task: any) => task.runId === run.id)).toBe(true)
    const foreignTasks = await jsonRequest('/api/organizations/assigned-tasks', outsider)
    expect(foreignTasks.body.data.list.some((task: any) => task.runId === run.id)).toBe(false)
    expect(JSON.stringify(tasks.body.data)).not.toContain('subjectUserId')

    // Exact Run binding admits an assigned ADMIN respondent, never other ADMINs.
    const task = tasks.body.data.list.find((item: any) => item.runId === run.id)
    const runtimeRef = randomUUID()
    await db.$executeRaw`UPDATE "assessment_run_executions" SET "runtime_binding_kind" = 'COMPOSITE', "runtime_binding_ref" = ${runtimeRef} WHERE "id" = ${task.executionId}`
    await db.user.update({ where: { id: student.id }, data: { role: UserRole.ADMIN } })
    await db.user.update({ where: { id: outsider.id }, data: { role: UserRole.ADMIN } })
    expect((await jsonRequest(`/api/runtime-probe/${runtimeRef}`, student)).status).toBe(200)
    expect((await jsonRequest(`/api/runtime-probe/${runtimeRef}`, outsider)).status).toBe(403)
    expect((await jsonRequest(`/api/runtime-probe/${randomUUID()}`, student)).status).toBe(403)

  })
})
