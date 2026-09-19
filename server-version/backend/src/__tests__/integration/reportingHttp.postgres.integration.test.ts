import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import organizationRoutes from '../../modules/organization/organization.routes'
import { csrfProtection } from '../../middleware/csrf'
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../utils/authCookies'
import { generateToken } from '../../utils/jwt'
import { createMembership, createOrganization, denyOrganizationAccess, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createPlatformReportingSpec, publishPlatformReportingSpec, reviewPlatformReportingSpec } from '../../modules/reporting/spec'
import { freezeRunTrackCohort } from '../../modules/reporting/cohort'
import { buildReportingArtifact } from '../../modules/reporting/engine'
import { createOrReuseReportingArtifact } from '../../modules/reporting/artifact'
import type { ReportingAnalysisSpecDefinitionV1, ReportingResultBatchV1 } from '../../modules/reporting/types'

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
const commandKey = (label: string) => `reporting-http-${label}-${suffix}-${randomUUID()}`

const requestedPolicy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}
const resourceAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
    supportsSafeCancel: true, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, applicability: requestedPolicy }),
      ...requestedPolicy,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'reporting-http-composite' },
    }
  },
}
const resourceRegistry = new RunResourceAuthorityRegistry([resourceAdapter])

const definition: ReportingAnalysisSpecDefinitionV1 = {
  schemaVersion: 1,
  analysisKind: 'GROUP',
  engineKey: 'ORG_GROUP_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumCohortN: 3,
  minimumContributorN: 3,
  reportEvidenceCeiling: 'PILOT',
  metricRules: [{
    metricId: 'score',
    sourceMetricKey: 'score',
    acceptedResultQuality: ['interpretable'],
    acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
    aggregations: ['MEAN'],
    missingnessRule: 'EXCLUDE',
    minimumMetricN: 3,
    observationUnit: 'SUBJECT',
    selectionPolicy: 'UNIQUE_OR_REJECT',
  }],
}

type TestUser = {
  id: string
  username: string
  role: UserRole
  platformRole: PlatformRole
  tokenVersion: number
}

async function createUser(label: string, role: UserRole, platformRole: PlatformRole = PlatformRole.STANDARD): Promise<TestUser> {
  return db.user.create({
    data: {
      username: `reporting-http-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
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

const csrfOnlyHeaders = (csrf = `csrf-${suffix}`): Record<string, string> => ({
  cookie: `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrf)}`,
  [CSRF_HEADER_NAME]: csrf,
  'content-type': 'application/json',
})

async function jsonRequest(path: string, input: {
  method?: string
  user?: TestUser
  body?: unknown
  includeCsrf?: boolean
} = {}) {
  const method = input.method ?? 'GET'
  const headers: Record<string, string> = input.user
    ? authHeaders(input.user)
    : input.includeCsrf
      ? csrfOnlyHeaders()
      : { 'content-type': 'application/json' }
  if (input.user && input.includeCsrf === false) delete headers[CSRF_HEADER_NAME]
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
  return { status: response.status, body: await response.json() as Record<string, any> }
}

async function publishSelfRun(organizationId: string, ownerId: string, membershipIds: string[]) {
  const run = await createAssessmentRunDraft({ organizationId, name: `HTTP run ${suffix}`, createdByUserId: ownerId })
  await addAssessmentRunTrackDraft({
    organizationId,
    runId: run.id,
    resource: { family: 'BUNDLE', key: `reporting-http-${suffix}`, version: '1.0.0' },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds },
    requestedPolicy,
  })
  await publishAssessmentRun({
    organizationId,
    runId: run.id,
    actorUserId: ownerId,
    expectedVersion: 2,
    resourceRegistry,
  })
  const tracks = await db.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT id FROM assessment_run_tracks WHERE run_id=$1 ORDER BY created_at LIMIT 1',
    run.id,
  )
  return { runId: run.id, trackId: tracks[0].id }
}

suite('PR3 reporting HTTP release gate (real PostgreSQL)', () => {
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
    if (!address || typeof address === 'string') throw new Error('reporting HTTP test server did not bind TCP')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.$disconnect()
  })

  it('enforces platform governance and strict request schemas at the HTTP boundary', async () => {
    const admin = await createUser('platform-admin', UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
    const standard = await createUser('standard', UserRole.TEACHER)
    const specKey = `http-governed-${suffix}`

    // Production mounts CSRF protection before authenticated Organization routes.
    // A write with neither session nor CSRF is rejected at the outer boundary.
    const blockedByCsrf = await jsonRequest('/api/organizations/reporting-specs', {
      method: 'POST', body: { specKey, version: 1, definition },
    })
    expect(blockedByCsrf.status).toBe(403)

    // Once the double-submit CSRF boundary is satisfied, the missing session is
    // evaluated by authenticate and remains a distinct 401 failure.
    const unauthenticated = await jsonRequest('/api/organizations/reporting-specs', {
      method: 'POST', includeCsrf: true, body: { specKey, version: 1, definition },
    })
    expect(unauthenticated.status).toBe(401)

    const noCsrf = await jsonRequest('/api/organizations/reporting-specs', {
      method: 'POST', user: admin, includeCsrf: false, body: { specKey, version: 1, definition },
    })
    expect(noCsrf.status).toBe(403)

    const forbidden = await jsonRequest('/api/organizations/reporting-specs', {
      method: 'POST', user: standard, body: { specKey, version: 1, definition },
    })
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.code).toBe('REPORT_SPEC_AUTHORITY')

    const unsupportedKind = await jsonRequest('/api/organizations/reporting-specs', {
      method: 'POST', user: admin,
      body: { specKey: `${specKey}-longitudinal`, version: 1, definition: { ...definition, analysisKind: 'LONGITUDINAL' } },
    })
    expect(unsupportedKind.status).toBe(400)
    expect(unsupportedKind.body.code).toBe('REPORT_SPEC_INVALID')

    const created = await jsonRequest('/api/organizations/reporting-specs', {
      method: 'POST', user: admin, body: { specKey, version: 1, definition },
    })
    expect(created.status).toBe(200)
    expect(created.body.data.status).toBe('DRAFT')

    const duplicate = await jsonRequest('/api/organizations/reporting-specs', {
      method: 'POST', user: admin, body: { specKey, version: 1, definition },
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('REPORT_SPEC_VERSION_CONFLICT')
  })

  it('keeps analysis server-owned and artifact projections audience-safe on every read', async () => {
    const admin = await createUser('org-admin', UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
    const students = await Promise.all(Array.from({ length: 3 }, (_, index) => createUser(`student-${index}`, UserRole.STUDENT)))
    const org = await createOrganization({
      name: `Reporting HTTP ${suffix}`,
      meta: { actorUserId: admin.id, commandKey: commandKey('org') },
    })
    const memberships = [] as Array<{ id: string }>
    for (let index = 0; index < students.length; index += 1) {
      const membership = await createMembership({
        organizationId: org.organization.id,
        userId: students[index].id,
        meta: { actorUserId: admin.id, commandKey: commandKey(`membership-${index}`) },
      })
      await grantPersona({
        organizationId: org.organization.id,
        membershipId: membership.id,
        persona: 'STUDENT',
        meta: { actorUserId: admin.id, commandKey: commandKey(`persona-${index}`) },
      })
      memberships.push(membership)
    }
    const source = await publishSelfRun(org.organization.id, admin.id, memberships.map((row) => row.id))
    const cohort = await freezeRunTrackCohort({
      organizationId: org.organization.id,
      runId: source.runId,
      trackId: source.trackId,
      generatedByUserId: admin.id,
    })
    const draft = await createPlatformReportingSpec({
      actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      specKey: `http-artifact-${suffix}`,
      version: 1,
      definition,
    })

    const unpublished = await jsonRequest(`/api/organizations/${org.organization.id}/reporting/analyses`, {
      method: 'POST', user: admin,
      body: { runId: source.runId, trackId: source.trackId, specId: draft.id },
    })
    expect(unpublished.status).toBe(404)
    expect(unpublished.body.code).toBe('REPORT_SPEC_NOT_PUBLISHED')

    const invalidOptions = await jsonRequest(`/api/organizations/${org.organization.id}/reporting/analyses`, {
      method: 'POST', user: admin,
      body: { runId: source.runId, trackId: source.trackId, specId: draft.id, options: { rawRows: true } },
    })
    expect(invalidOptions.status).toBe(400)
    expect(invalidOptions.body.code).toBe('REPORT_REQUEST_INVALID')

    const crossOrgRun = await jsonRequest(`/api/organizations/${randomUUID()}/reporting/analyses`, {
      method: 'POST', user: admin,
      body: { runId: source.runId, trackId: source.trackId, specId: draft.id },
    })
    expect(crossOrgRun.status).toBe(404)
    expect(crossOrgRun.body.code).toBe('REPORT_NOT_FOUND')

    await reviewPlatformReportingSpec({ actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' }, specId: draft.id })
    const published = await publishPlatformReportingSpec({ actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' }, specId: draft.id })
    const resultBatch: ReportingResultBatchV1 = {
      resourceFamily: 'BUNDLE',
      resourceKey: `reporting-http-${suffix}`,
      resourceVersion: '1.0.0',
      resourceMinimumN: null,
      resolved: cohort.members.map((member, index) => ({
        executionId: member.executionId,
        subjectUserId: member.userId,
        membershipId: member.membershipId,
        trackId: source.trackId,
        canonicalResultHash: canonicalHash({ executionId: member.executionId, index }),
        metrics: [{ key: 'score', value: index + 1, resultQuality: 'interpretable', metricQuality: null }],
        scientificMaturity: 'PILOT',
        provenanceState: 'FROZEN',
        scientificProvenanceHash: canonicalHash({ provenance: member.executionId }),
      })),
      unresolved: [],
    }
    const generatedAt = new Date()
    const built = buildReportingArtifact({
      artifactId: randomUUID(),
      generatedByUserId: admin.id,
      generatedAt: generatedAt.toISOString(),
      spec: published,
      cohort,
      batch: resultBatch,
    })
    const artifact = await createOrReuseReportingArtifact({
      organizationId: org.organization.id,
      cohortSnapshotId: cohort.id,
      specId: published.id,
      analysisIdentityHash: built.analysisIdentityHash,
      artifactPayload: built.payload,
      snapshotHash: built.snapshotHash,
      generatedByUserId: admin.id,
      generatedAt,
    })

    const allowed = await jsonRequest(`/api/organizations/${org.organization.id}/reporting/artifacts/${artifact.id}`, { user: admin })
    expect(allowed.status).toBe(200)
    expect(Object.keys(allowed.body.data).sort()).toEqual(['artifactId', 'generatedAt', 'projection'])
    expect(allowed.body.data).not.toHaveProperty('inputManifest')
    expect(allowed.body.data).not.toHaveProperty('snapshotHash')
    expect(allowed.body.data).not.toHaveProperty('analysisIdentityHash')

    const guessedOtherOrg = await jsonRequest(`/api/organizations/${randomUUID()}/reporting/artifacts/${artifact.id}`, { user: admin })
    expect(guessedOtherOrg.status).toBe(404)
    expect(guessedOtherOrg.body.code).toBe('REPORT_ARTIFACT_NOT_FOUND')

    const studentRead = await jsonRequest(`/api/organizations/${org.organization.id}/reporting/artifacts/${artifact.id}`, { user: students[0] })
    expect(studentRead.status).toBe(404)
    expect(studentRead.body.code).toBe('REPORT_ARTIFACT_NOT_FOUND')

    await denyOrganizationAccess({
      organizationId: org.organization.id,
      userId: admin.id,
      permission: 'REPORT_READ',
      reason: 'HTTP cached-read authorization regression',
      meta: { actorUserId: admin.id, commandKey: commandKey('deny') },
    })
    const deniedAfterCache = await jsonRequest(`/api/organizations/${org.organization.id}/reporting/artifacts/${artifact.id}`, { user: admin })
    expect(deniedAfterCache.status).toBe(404)
    expect(deniedAfterCache.body.code).toBe('REPORT_ARTIFACT_NOT_FOUND')
  })
})