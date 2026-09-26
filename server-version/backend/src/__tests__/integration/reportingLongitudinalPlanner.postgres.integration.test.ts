import { buildReportingFixture } from './reporting-fixture'
import { endMembership } from '../../modules/organization/service'
import { generateAutomaticLongitudinal } from '../../modules/reporting/longitudinal-planner'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeRunTrackCohort } from '../../modules/reporting/cohort'
import {
  bindReportingSeriesWave,
  createReportingSeries,
  readReportingSeriesWave,
} from '../../modules/reporting/series'
import { createLongitudinalAnalysisArtifact } from '../../modules/reporting/pr4Artifact'
import {
  createPlatformReportingSpec,
  publishPlatformReportingSpec,
  reviewPlatformReportingSpec,
} from '../../modules/reporting/spec'
import type { ReportingAnalysisSpecRecord, ReportingRepeatedCohortSpecV1 } from '../../modules/reporting/types'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
if (!DB_URL) throw new Error('Automatic longitudinal acceptance requires an isolated PostgreSQL database')
const suite = describe
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `reporting-series-${label}-${suffix}-${randomUUID()}`
const resourceKey = `longitudinal-${suffix}`

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
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'reporting-series-test-composite' },
    }
  },
}
const resourceRegistry = new RunResourceAuthorityRegistry([resourceAdapter])

async function createUser(label: string, platformRole: PlatformRole = PlatformRole.STANDARD, role: UserRole = UserRole.STUDENT) {
  return db.user.create({
    data: {
      username: `series-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
      platformRole,
    },
    select: { id: true },
  })
}

async function publishSelfRun(input: {
  organizationId: string
  ownerId: string
  membershipIds: string[]
  version: string
  label: string
}) {
  const run = await createAssessmentRunDraft({ organizationId: input.organizationId, name: input.label, createdByUserId: input.ownerId })
  await addAssessmentRunTrackDraft({
    organizationId: input.organizationId,
    runId: run.id,
    resource: { family: 'BUNDLE', key: resourceKey, version: input.version },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: input.membershipIds },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: input.membershipIds },
    requestedPolicy,
  })
  await publishAssessmentRun({
    organizationId: input.organizationId,
    runId: run.id,
    actorUserId: input.ownerId,
    expectedVersion: 2,
    resourceRegistry,
  })
  const tracks = await db.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT id FROM assessment_run_tracks WHERE run_id=$1 ORDER BY created_at LIMIT 1',
    run.id,
  )
  return { runId: run.id, trackId: tracks[0].id }
}


suite('automatic filtered longitudinal planning (real PostgreSQL)', () => {
  beforeAll(async () => { db = new PrismaClient({ datasources: { db: { url: DB_URL! } } }); await db.$connect() })
  afterAll(async () => db.$disconnect())
  it('orders selected sources, freezes the subgroup, supports both engines and safely reuses inputs', async () => {
    const admin = await createUser('admin', PlatformRole.SYSTEM_ADMIN, UserRole.ADMIN)
    const org = await createOrganization({ name: key('org'), meta: { actorUserId: admin.id, commandKey: key('org') } })
    const organizationId = org.organization.id
    const memberships: string[] = []
    for (let i = 0; i < 4; i++) {
      const user = await createUser(`s${i}`)
      const member = await createMembership({ organizationId, userId: user.id, meta: { actorUserId: admin.id, commandKey: key('member') } })
      await grantPersona({ organizationId, membershipId: member.id, persona: 'STUDENT', meta: { actorUserId: admin.id, commandKey: key('persona') } })
      memberships.push(member.id)
    }
    const first = await publishSelfRun({ organizationId, ownerId: admin.id, membershipIds: memberships, version: '1.0.0', label: 'T1' })
    const second = await publishSelfRun({ organizationId, ownerId: admin.id, membershipIds: memberships, version: '1.0.0', label: 'T2' })
    const third = await publishSelfRun({ organizationId, ownerId: admin.id, membershipIds: memberships, version: '1.0.0', label: 'T3' })
    const principal = { userId: admin.id, platformRole: 'SYSTEM_ADMIN' as const }
    for (const analysisKind of ['REPEATED_COHORT', 'MATCHED_LONGITUDINAL'] as const) {
      const spec = await createPlatformReportingSpec({ actor: principal, specKey: key(analysisKind), version: 1, definition: {
        schemaVersion: 1, analysisKind, engineKey: analysisKind === 'REPEATED_COHORT' ? 'ORG_REPEATED_COHORT_V1' : 'ORG_MATCHED_LONGITUDINAL_V1', engineVersion: '1.0.0',
        privacyUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT', minimumCohortN: 3, minimumContributorN: 3, reportEvidenceCeiling: 'PILOT',
        metricRules: [{ metricId: 'score', sourceMetricKey: 'score', sourceFamily: 'BUNDLE', sourceResourceKey: resourceKey, valueType: 'NUMBER', longitudinalMetricKey: 'score', acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'], missingnessRule: 'EXCLUDE', minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT' }], comparabilityRules: [],
      } })
      await reviewPlatformReportingSpec({ actor: principal, specId: spec.id })
      await publishPlatformReportingSpec({ actor: principal, specId: spec.id })
      for (const cohortStrategy of ['WAVE_SPECIFIC', 'BASELINE_FIXED'] as const) {
        const input = { principal, organizationId, specId: spec.id, analysisKind, sources: [third, second, first], cohortStrategy, ...(analysisKind === 'MATCHED_LONGITUDINAL' ? { mode: 'FULL_CASE' as const } : {}),
          cohortSelector: { schemaVersion: 2 as const, combine: 'ALL' as const, clauses: [{ kind: 'MEMBERSHIP_IDS' as const, membershipIds: memberships.slice(0, 3) }] } }
        const result = await generateAutomaticLongitudinal(input)
        expect(result.projection.kind).toBe(analysisKind)
        const retry = await generateAutomaticLongitudinal({ ...input, sources: [first, second, third] })
        expect(retry.artifactId).toBe(result.artifactId)
        const concurrent = await Promise.all([generateAutomaticLongitudinal(input), generateAutomaticLongitudinal(input)])
        expect(concurrent.map(r => r.artifactId)).toEqual([result.artifactId, result.artifactId])
        const waves = await db.$queryRaw<Array<{ sourceRunId: string; n: number; manifest: { unresolved: unknown[] } }>>`
          SELECT w.source_run_id AS "sourceRunId", c.eligible_n AS n, w.input_manifest AS manifest FROM reporting_analysis_artifact_waves a
          JOIN reporting_series_waves w ON w.id=a.wave_id JOIN reporting_cohort_snapshots c ON c.id=w.cohort_snapshot_id
          WHERE a.artifact_id=${result.artifactId} ORDER BY a.ordinal`
        expect(waves.map(w => w.sourceRunId)).toEqual([first.runId, second.runId, third.runId])
        expect(waves.map(w => w.n)).toEqual([3, 3, 3])
        expect(waves.map(w => w.manifest.unresolved.length)).toEqual([3, 3, 3])
        await expect(generateAutomaticLongitudinal({ ...input, sources: [first, first] })).rejects.toMatchObject({ code: 'REPORT_LONGITUDINAL_WAVES_REQUIRED' })
        await expect(generateAutomaticLongitudinal({ ...input, sources: [first, { runId: randomUUID(), trackId: randomUUID() }] })).rejects.toMatchObject({ statusCode: 404 })
      }
    }
  }, 60000)
  it('matches completed stable users across membership episodes and applies subgroup privacy', async () => {
    const f = await buildReportingFixture(db, 5)
    await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: f.organizationId, userId: f.ownerId, orgRole: 'ORG_ADMIN' } })
    const track = await db.$queryRaw<Array<{ key: string }>>`SELECT resource_key AS key FROM assessment_run_tracks WHERE id=${f.trackId}`
    const principal = { userId: f.ownerId, platformRole: 'STANDARD' as const }
    const initialMembers = f.members.slice(0, 3).map(m => m.membershipId)
    // A later membership episode for the same student must still match.
    const changed = f.members[0]
    await endMembership({ organizationId: f.organizationId, membershipId: changed.membershipId, meta: { actorUserId: f.ownerId, commandKey: key('end') } })
    const nextMember = await createMembership({ organizationId: f.organizationId, userId: changed.userId, meta: { actorUserId: f.ownerId, commandKey: key('new-episode') } })
    const repeatedMembers = f.members.map(m => ({ userId: m.userId, membershipId: m === changed ? nextMember.id : m.membershipId }))
    const second = await buildReportingFixture(db, 5, false, { ownerId: f.ownerId, organizationId: f.organizationId, members: repeatedMembers, resourceKey: track[0].key, at: new Date('2026-10-01T00:00:00Z') })
    const admin = await createUser('spec-admin', PlatformRole.SYSTEM_ADMIN, UserRole.ADMIN)
    const actor = { userId: admin.id, platformRole: 'SYSTEM_ADMIN' as const }
    const spec = await createPlatformReportingSpec({ actor, specKey: key('completed'), version: 1, definition: {
      schemaVersion: 1, analysisKind: 'MATCHED_LONGITUDINAL', engineKey: 'ORG_MATCHED_LONGITUDINAL_V1', engineVersion: '1.0.0', privacyUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT', minimumCohortN: 3, minimumContributorN: 3, reportEvidenceCeiling: 'PILOT',
      metricRules: [{ metricId: 'score', sourceMetricKey: 'score', sourceFamily: 'BUNDLE', sourceResourceKey: track[0].key, valueType: 'NUMBER', longitudinalMetricKey: 'score', acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'], missingnessRule: 'EXCLUDE', minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT' }],
      comparabilityRules: [{ schemaVersion: 1, metricId: 'score', resourceFamily: 'BUNDLE', resourceKey: track[0].key, fromVersion: '1.0.0', toVersion: '1.0.0', level: 'EXACT', evidenceRef: 'test:same-protocol', evidenceHash: 'e'.repeat(64) }],
    } })
    await reviewPlatformReportingSpec({ actor, specId: spec.id })
    await publishPlatformReportingSpec({ actor, specId: spec.id })
    const input = { principal, organizationId: f.organizationId, specId: spec.id, analysisKind: 'MATCHED_LONGITUDINAL' as const, mode: 'FULL_CASE' as const,
      sources: [f, second].map(({ runId, trackId }) => ({ runId, trackId })), cohortStrategy: 'BASELINE_FIXED' as const,
      cohortSelector: { schemaVersion: 2 as const, combine: 'ALL' as const, clauses: [{ kind: 'MEMBERSHIP_IDS' as const, membershipIds: initialMembers }] } }
    const result = await generateAutomaticLongitudinal(input)
    expect(result.projection.kind).toBe('MATCHED_LONGITUDINAL')
    if (result.projection.kind !== 'MATCHED_LONGITUDINAL') throw new Error('wrong projection')
    expect(result.projection.state).toBe('present')
    expect(result.projection.matchedEligibleN).toBe(3)
    expect(result.projection.metrics?.score.validCaseN).toBe(3)
    expect(result.projection.metrics?.score.comparisons?.[0].delta).toBe(0)
    const small = await generateAutomaticLongitudinal({ ...input, cohortSelector: { ...input.cohortSelector, clauses: [{ kind: 'MEMBERSHIP_IDS', membershipIds: initialMembers.slice(0, 2) }] } })
    expect(small.projection.state).toBe('suppressed')
    const waveSpecific = await generateAutomaticLongitudinal({ ...input, cohortStrategy: 'WAVE_SPECIFIC' })
    expect(waveSpecific.projection.state).toBe('suppressed')
  }, 60000)

  it('bounds queries for three completed waves of 1000 subjects', async () => {
    const { prisma }=await import('../../config/database')
    let queries=0
    prisma.$use(async (params,next)=>{queries++;return next(params)})
    const counts:number[]=[]
    for(const population of [100,1000]) {
      const first=await buildReportingFixture(db,population)
      await db.organizationMembership.create({data:{id:randomUUID(),organizationId:first.organizationId,userId:first.ownerId,orgRole:'ORG_ADMIN'}})
      const resource=(await db.$queryRaw<Array<{key:string}>>`SELECT resource_key AS key FROM assessment_run_tracks WHERE id=${first.trackId}`)[0].key
      const waves=[first]
      for(const at of [new Date('2026-10-01'),new Date('2026-11-01')]) waves.push(await buildReportingFixture(db,population,false,{ownerId:first.ownerId,organizationId:first.organizationId,members:first.members,resourceKey:resource,at}))
      const actor={userId:first.ownerId,platformRole:'SYSTEM_ADMIN' as const}
      const spec=await createPlatformReportingSpec({actor,specKey:key('performance'),version:1,definition:{
        schemaVersion:1,analysisKind:'MATCHED_LONGITUDINAL',engineKey:'ORG_MATCHED_LONGITUDINAL_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:3,minimumContributorN:3,reportEvidenceCeiling:'PILOT',
        metricRules:[{metricId:'score',sourceMetricKey:'score',sourceFamily:'BUNDLE',sourceResourceKey:resource,valueType:'NUMBER',longitudinalMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN'],missingnessRule:'EXCLUDE',minimumMetricN:3,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],comparabilityRules:[]}})
      await reviewPlatformReportingSpec({actor,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
      queries=0
      const result=await generateAutomaticLongitudinal({principal:{userId:first.ownerId,platformRole:'STANDARD'},organizationId:first.organizationId,specId:spec.id,analysisKind:'MATCHED_LONGITUDINAL',sources:waves.map(({runId,trackId})=>({runId,trackId})),cohortStrategy:'BASELINE_FIXED',mode:'FULL_CASE'})
      counts.push(queries)
      expect(result.projection.state).toBe('present')
      expect((result.projection as any).matchedEligibleN).toBe(population)
    }
    expect(counts[0]).toBeGreaterThan(0)
    console.info('Three-wave query budget', { populations: [100,1000], counts })
    expect(counts[1]).toBeLessThanOrEqual(counts[0]+30)
    expect(counts[1]).toBeLessThan(600)
  },180000)

})
