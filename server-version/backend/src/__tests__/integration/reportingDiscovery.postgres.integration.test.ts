import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { createMembership, createOrganization, denyOrganizationAccess, grantPersona } from '../../modules/organization/service'
import {
  listOrganizationReportingSeries,
  listOrganizationReportingSources,
  listPublishedReportingSpecs,
} from '../../modules/reporting/discovery'
import { bindOrganizationReportingWave, createOrganizationReportingSeries } from '../../modules/reporting/pr4Service'
import { createPlatformReportingSpec, publishPlatformReportingSpec, reviewPlatformReportingSpec } from '../../modules/reporting/spec'
import type { ReportingAnalysisSpecDefinitionV1 } from '../../modules/reporting/types'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const commandKey = (label: string) => `reporting-discovery-${label}-${suffix}-${randomUUID()}`

const requestedPolicy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}
const resourceKey = `reporting-discovery-${suffix}`
const resourceAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
    supportsSafeCancel: true, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, requestedPolicy }),
      ...requestedPolicy,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'reporting-discovery-composite' },
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
    metricId: 'score', sourceMetricKey: 'score', acceptedResultQuality: ['interpretable'],
    acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'], missingnessRule: 'EXCLUDE',
    minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT',
  }],
}

type UserRecord = { id: string; platformRole: PlatformRole }
async function createUser(label: string, platformRole: PlatformRole = PlatformRole.STANDARD): Promise<UserRecord> {
  return db.user.create({
    data: {
      username: `reporting-discovery-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
      platformRole,
    },
    select: { id: true, platformRole: true },
  })
}

suite('PR5 reporting product discovery (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('discovers only current-authorized product identities without leaking suppressed population counts', async () => {
    const owner = await createUser('owner', PlatformRole.SYSTEM_ADMIN)
    const teacher = await createUser('teacher')
    const students = await Promise.all(Array.from({ length: 3 }, (_, index) => createUser(`student-${index}`)))
    const org = await createOrganization({ name: `Reporting discovery ${suffix}`, meta: { actorUserId: owner.id, commandKey: commandKey('org') } })

    const studentMembershipIds: string[] = []
    for (let index = 0; index < students.length; index += 1) {
      const membership = await createMembership({
        organizationId: org.organization.id,
        userId: students[index].id,
        meta: { actorUserId: owner.id, commandKey: commandKey(`student-membership-${index}`) },
      })
      await grantPersona({
        organizationId: org.organization.id,
        membershipId: membership.id,
        persona: 'STUDENT',
        meta: { actorUserId: owner.id, commandKey: commandKey(`student-persona-${index}`) },
      })
      studentMembershipIds.push(membership.id)
    }
    const teacherMembership = await createMembership({
      organizationId: org.organization.id,
      userId: teacher.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('teacher-membership') },
    })
    await grantPersona({
      organizationId: org.organization.id,
      membershipId: teacherMembership.id,
      persona: 'TEACHER',
      meta: { actorUserId: owner.id, commandKey: commandKey('teacher-persona') },
    })

    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: `Discovery run ${suffix}`, createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({
      organizationId: org.organization.id,
      runId: run.id,
      resource: { family: 'BUNDLE', key: resourceKey, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: studentMembershipIds },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: studentMembershipIds },
      requestedPolicy,
    })
    await publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry })
    const tracks = await db.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM assessment_run_tracks WHERE run_id=$1 ORDER BY created_at LIMIT 1', run.id)
    const trackId = tracks[0].id

    const draft = await createPlatformReportingSpec({
      actor: { userId: owner.id, platformRole: 'SYSTEM_ADMIN' },
      specKey: `discovery-group-${suffix}`,
      version: 1,
      definition,
    })
    await reviewPlatformReportingSpec({ actor: { userId: owner.id, platformRole: 'SYSTEM_ADMIN' }, specId: draft.id })
    await publishPlatformReportingSpec({ actor: { userId: owner.id, platformRole: 'SYSTEM_ADMIN' }, specId: draft.id })

    const ownerPrincipal = { userId: owner.id, platformRole: 'SYSTEM_ADMIN' as const }
    const specs = await listPublishedReportingSpecs({ principal: ownerPrincipal, organizationId: org.organization.id, analysisKind: 'GROUP', page: 1, pageSize: 100 })
    expect(specs.list.some((item) => item.specId === draft.id)).toBe(true)

    const sources = await listOrganizationReportingSources({ principal: ownerPrincipal, organizationId: org.organization.id })
    const source = sources.list.find((item) => item.runId === run.id && item.trackId === trackId)
    expect(source).toBeDefined()
    expect(source).not.toHaveProperty('eligibleN')
    expect(source).not.toHaveProperty('executionCount')

    const teacherSources = await listOrganizationReportingSources({
      principal: { userId: teacher.id, platformRole: 'STANDARD' },
      organizationId: org.organization.id,
    })
    expect(teacherSources.list.some((item) => item.runId === run.id)).toBe(false)

    const series = await createOrganizationReportingSeries({
      principal: ownerPrincipal,
      organizationId: org.organization.id,
      seriesKey: `series-${suffix}`,
      resourceFamily: 'BUNDLE',
      resourceKey,
    })
    await bindOrganizationReportingWave({
      principal: ownerPrincipal,
      organizationId: org.organization.id,
      seriesId: series.seriesId,
      waveKey: 'baseline',
      ordinal: 1,
      runId: run.id,
      trackId,
    })
    const discoveredSeries = await listOrganizationReportingSeries({ principal: ownerPrincipal, organizationId: org.organization.id, page: 1, pageSize: 50 })
    const listed = discoveredSeries.list.find((item) => item.seriesId === series.seriesId)
    expect(listed?.waves.map((wave) => wave.waveKey)).toContain('baseline')
    expect(listed).not.toHaveProperty('inputManifest')

    await denyOrganizationAccess({
      organizationId: org.organization.id,
      userId: owner.id,
      permission: 'REPORT_READ',
      reason: 'test current read revocation',
      meta: { actorUserId: owner.id, commandKey: commandKey('deny-report-read') },
    })
    await expect(listPublishedReportingSpecs({ principal: ownerPrincipal, organizationId: org.organization.id, page: 1, pageSize: 50 }))
      .rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
  })
})
