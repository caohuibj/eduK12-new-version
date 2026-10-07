import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona, denyOrganizationAccess } from '../../modules/organization/service'
import { createAssessmentRunDraft, addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `run-publish-${label}-${suffix}-${randomUUID()}`

async function createUser(label: string, platformRole: PlatformRole = PlatformRole.STANDARD) {
  return db.user.create({
    data: {
      username: `run-publish-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
      platformRole,
    },
    select: { id: true },
  })
}

const requestedPolicy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}

const testAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
    supportsSafeCancel: true, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, applicability: requestedPolicy }),
      subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'test-composite' },
    }
  },
}
const registry = new RunResourceAuthorityRegistry([testAdapter])

suite('Assessment Run atomic publish (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('publishes an immutable SELF graph once and repeated publish does not duplicate side effects', async () => {
    const owner = await createUser('owner')
    const student = await createUser('student')
    const org = await createOrganization({ name: `publish success ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('org') } })
    const membership = await createMembership({ organizationId: org.organization.id, userId: student.id, meta: { actorUserId: owner.id, commandKey: key('member') } })
    await grantPersona({ organizationId: org.organization.id, membershipId: membership.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key('student-persona') } })
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'success', createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({
      organizationId: org.organization.id, runId: run.id,
      resource: { family: 'BUNDLE', key: 'self-demo', version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] },
      requestedPolicy,
    })
    const first = await publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
    expect(first.executionCount).toBe(1)
    const second = await publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
    expect(second.executionCount).toBe(1)

    const [state, counts, assignments, episodes] = await Promise.all([
      db.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status FROM assessment_runs WHERE id=$1`, run.id),
      db.$queryRawUnsafe<Array<{ executions: number; allocations: number; actors: number }>>(
        `SELECT (SELECT COUNT(*)::int FROM assessment_run_executions WHERE run_id=$1) executions, (SELECT COUNT(*)::int FROM organization_episode_allocations WHERE run_id=$1) allocations, (SELECT COUNT(*)::int FROM assessment_run_actor_snapshots WHERE run_id=$1) actors`, run.id,
      ),
      db.$queryRawUnsafe<Array<{ policyDomain: string }>>(`SELECT policy_domain AS "policyDomain" FROM relational_assessment_assignments WHERE id=(SELECT relational_assignment_id FROM assessment_run_executions WHERE run_id=$1 LIMIT 1)`, run.id),
      db.$queryRawUnsafe<Array<{ initiationMode: string; courseId: string | null }>>(`SELECT initiation_mode::text AS "initiationMode", course_id AS "courseId" FROM assessment_episodes WHERE id=(SELECT assessment_episode_id FROM organization_episode_allocations WHERE run_id=$1 LIMIT 1)`, run.id),
    ])
    expect(state[0]?.status).toBe('PUBLISHED')
    expect(counts[0]).toEqual({ executions: 1, allocations: 1, actors: 1 })
    expect(assignments[0]?.policyDomain).toBe('ORGANIZATION_RUN')
    expect(episodes[0]).toEqual({ initiationMode: 'ORGANIZATION_RUN', courseId: null })
    await denyOrganizationAccess({ organizationId: org.organization.id, userId: owner.id, permission: '*', reason: 'review deny', meta: { actorUserId: owner.id, commandKey: key('deny-publisher') } })
    await expect(publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })).rejects.toMatchObject({ code: 'RUN_PUBLISH_FORBIDDEN' })

  })

  it('freezes only usable current principals, including a finite future end but excluding a future start', async () => {
    const owner = await createUser('population-owner')
    const org = await createOrganization({ name: `current population ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('current-org') } })
    const organizationId = org.organization.id
    const eligible: string[] = []
    for (const state of ['current', 'finite-end', 'inactive', 'frozen', 'expired', 'must-change', 'future-start', 'future-persona', 'ended', 'denied']) {
      const student = await createUser(state)
      const member = await createMembership({ organizationId, userId: student.id, meta: { actorUserId: owner.id, commandKey: key('member-' + state) } })
      await grantPersona({ organizationId, membershipId: member.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key('persona-' + state) } })
      if (state === 'inactive') await db.user.update({ where: { id: student.id }, data: { isActive: false } })
      if (state === 'frozen') await db.user.update({ where: { id: student.id }, data: { isFrozen: true } })
      if (state === 'expired') await db.user.update({ where: { id: student.id }, data: { expiresAt: new Date(0) } })
      if (state === 'must-change') await db.user.update({ where: { id: student.id }, data: { mustChangePassword: true } })
      if (state === 'future-start') await db.$executeRaw`UPDATE organization_memberships SET valid_from=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE id=${member.id}`
      if (state === 'future-persona') await db.$executeRaw`UPDATE organization_persona_grants SET granted_at=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE membership_id=${member.id}`
      if (state === 'ended') await db.$executeRaw`UPDATE organization_memberships SET valid_from=CURRENT_TIMESTAMP-INTERVAL '2 days',valid_until=CURRENT_TIMESTAMP-INTERVAL '1 day' WHERE id=${member.id}`
      if (state === 'finite-end') await db.$executeRaw`UPDATE organization_memberships SET valid_until=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE id=${member.id}`
      if (state === 'denied') await denyOrganizationAccess({ organizationId, userId: student.id, permission: 'RUN_START', reason: 'synthetic deny', meta: { actorUserId: owner.id, commandKey: key('deny') } })
      if (['current', 'finite-end'].includes(state)) eligible.push(student.id)
    }
    const run = await createAssessmentRunDraft({ organizationId, name: 'current-only', createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({ organizationId, runId: run.id, resource: { family: 'BUNDLE', key: 'self-demo', version: '1.0.0' },
      subjectSelector: { kind: 'ALL_CURRENT' }, respondentSelector: { kind: 'ALL_CURRENT' }, requestedPolicy })
    expect((await publishAssessmentRun({ organizationId, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })).executionCount).toBe(2)
    const rows = await db.$queryRaw<Array<{ userId: string }>>`SELECT DISTINCT user_id AS "userId" FROM assessment_run_actor_snapshots WHERE run_id=${run.id}`
    expect(rows.map(row => row.userId).sort()).toEqual(eligible.sort())
  })

  it('rolls back the complete graph if a later Track resolves an empty population', async () => {
    const owner = await createUser('rollback-owner')
    const student = await createUser('rollback-student')
    const org = await createOrganization({ name: `publish rollback ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('rollback-org') } })
    const membership = await createMembership({ organizationId: org.organization.id, userId: student.id, meta: { actorUserId: owner.id, commandKey: key('rollback-member') } })
    await grantPersona({ organizationId: org.organization.id, membershipId: membership.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key('rollback-persona') } })
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'rollback', createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'ok', version: '1.0.0' }, subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] }, respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] }, requestedPolicy })
    await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'empty', version: '1.0.0' }, subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: ['missing-membership'] }, respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: ['missing-membership'] }, requestedPolicy })

    await expect(publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 3, resourceRegistry: registry }))
      .rejects.toMatchObject({ code: 'RUN_EMPTY_POPULATION' })

    const state = await db.$queryRawUnsafe<Array<{ status: string; frozen: number; executions: number; allocations: number }>>(
      `SELECT r.status, (SELECT COUNT(*)::int FROM assessment_run_tracks t WHERE t.run_id=r.id AND t.frozen_resource_policy IS NOT NULL) frozen, (SELECT COUNT(*)::int FROM assessment_run_executions e WHERE e.run_id=r.id) executions, (SELECT COUNT(*)::int FROM organization_episode_allocations a WHERE a.run_id=r.id) allocations FROM assessment_runs r WHERE r.id=$1`, run.id,
    )
    expect(state[0]).toEqual({ status: 'DRAFT', frozen: 0, executions: 0, allocations: 0 })
  })

  it('does not let SYSTEM_ADMIN bypass product publisher scope without Organization membership', async () => {
    const owner = await createUser('platform-owner')
    const systemAdmin = await createUser('platform-admin', PlatformRole.SYSTEM_ADMIN)
    const student = await createUser('platform-student')
    const org = await createOrganization({ name: `platform boundary ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('platform-org') } })
    const membership = await createMembership({ organizationId: org.organization.id, userId: student.id, meta: { actorUserId: owner.id, commandKey: key('platform-member') } })
    await grantPersona({ organizationId: org.organization.id, membershipId: membership.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key('platform-persona') } })
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'platform', createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'platform', version: '1.0.0' }, subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] }, respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] }, requestedPolicy })

    await expect(publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: systemAdmin.id, expectedVersion: 2, resourceRegistry: registry }))
      .rejects.toMatchObject({ code: 'RUN_PUBLISH_FORBIDDEN', statusCode: 403 })
  })
})
