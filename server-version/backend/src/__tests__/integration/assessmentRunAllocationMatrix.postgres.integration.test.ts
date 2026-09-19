import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, assignStudentToClass } from '../../modules/organization/classRelationships'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `allocation-matrix-${label}-${suffix}-${randomUUID()}`
const policy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['TEACHER'], relationshipKinds: ['CLASS_TEACHER_STUDENT'],
  perspectives: ['OBSERVER_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_CLASS_OBSERVER_V1', minimumRespondents: null,
}
const adapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
    supportsSafeCancel: false, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, policy }), subjectRoles: ['STUDENT'], respondentRoles: ['TEACHER'],
      relationshipKinds: ['CLASS_TEACHER_STUDENT'], perspectives: ['OBSERVER_REPORT'], analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'ORG_CLASS_OBSERVER_V1', minimumRespondents: null,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'test-composite' },
    }
  },
}
const registry = new RunResourceAuthorityRegistry([adapter])

async function user(label: string, role: UserRole) {
  return db.user.create({ data: { username: `matrix-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role }, select: { id: true } })
}

suite('Assessment Run Episode allocation matrix (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('creates one Episode per Track+subject while allowing multiple respondents and separating different subjects', async () => {
    const owner = await user('owner', UserRole.TEACHER)
    const [studentA, studentB, teacherA, teacherB] = await Promise.all([
      user('student-a', UserRole.STUDENT), user('student-b', UserRole.STUDENT),
      user('teacher-a', UserRole.TEACHER), user('teacher-b', UserRole.TEACHER),
    ])
    const org = await createOrganization({ name: `matrix ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('org') } })
    const memberships = await Promise.all([
      createMembership({ organizationId: org.organization.id, userId: studentA.id, meta: { actorUserId: owner.id, commandKey: key('student-a') } }),
      createMembership({ organizationId: org.organization.id, userId: studentB.id, meta: { actorUserId: owner.id, commandKey: key('student-b') } }),
      createMembership({ organizationId: org.organization.id, userId: teacherA.id, meta: { actorUserId: owner.id, commandKey: key('teacher-a') } }),
      createMembership({ organizationId: org.organization.id, userId: teacherB.id, meta: { actorUserId: owner.id, commandKey: key('teacher-b') } }),
    ])
    await Promise.all([
      grantPersona({ organizationId: org.organization.id, membershipId: memberships[0].id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key('student-a-persona') } }),
      grantPersona({ organizationId: org.organization.id, membershipId: memberships[1].id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key('student-b-persona') } }),
      grantPersona({ organizationId: org.organization.id, membershipId: memberships[2].id, persona: 'TEACHER', meta: { actorUserId: owner.id, commandKey: key('teacher-a-persona') } }),
      grantPersona({ organizationId: org.organization.id, membershipId: memberships[3].id, persona: 'TEACHER', meta: { actorUserId: owner.id, commandKey: key('teacher-b-persona') } }),
    ])
    const grade = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'GRADE', name: 'Grade 7' })
    const classroom = await createOrganizationUnit({ organizationId: org.organization.id, unitKind: 'CLASS', name: 'Class A', parentUnitId: grade.id })
    await Promise.all([
      assignStudentToClass({ organizationId: org.organization.id, membershipId: memberships[0].id, classUnitId: classroom.id }),
      assignStudentToClass({ organizationId: org.organization.id, membershipId: memberships[1].id, classUnitId: classroom.id }),
      assignStaffToClass({ organizationId: org.organization.id, membershipId: memberships[2].id, classUnitId: classroom.id, staffRole: 'TEACHING' }),
      assignStaffToClass({ organizationId: org.organization.id, membershipId: memberships[3].id, classUnitId: classroom.id, staffRole: 'TEACHING' }),
    ])

    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'matrix', createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({
      organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'class-observer', version: '1.0.0' },
      subjectSelector: { kind: 'CLASS_UNITS', classUnitIds: [classroom.id] },
      respondentSelector: { kind: 'CLASS_UNITS', classUnitIds: [classroom.id] },
      requestedPolicy: policy,
    })
    const published = await publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
    expect(published.executionCount).toBe(4)

    const counts = await db.$queryRawUnsafe<Array<{ executions: number; allocations: number; episodes: number }>>(
      `SELECT (SELECT COUNT(*)::int FROM assessment_run_executions WHERE run_id=$1) executions,
              (SELECT COUNT(*)::int FROM organization_episode_allocations WHERE run_id=$1) allocations,
              (SELECT COUNT(DISTINCT assessment_episode_id)::int FROM organization_episode_allocations WHERE run_id=$1) episodes`,
      run.id,
    )
    expect(counts[0]).toEqual({ executions: 4, allocations: 2, episodes: 2 })

    const perSubject = await db.$queryRawUnsafe<Array<{ subjectUserId: string; executions: number; episodes: number }>>(
      `SELECT a.user_id AS "subjectUserId", COUNT(e.id)::int executions, COUNT(DISTINCT oa.assessment_episode_id)::int episodes
       FROM assessment_run_executions e
       JOIN assessment_run_actor_snapshots a ON a.id=e.subject_actor_snapshot_id
       JOIN organization_episode_allocations oa ON oa.run_id=e.run_id AND oa.track_id=e.track_id AND oa.subject_actor_snapshot_id=e.subject_actor_snapshot_id
       WHERE e.run_id=$1 GROUP BY a.user_id ORDER BY a.user_id`, run.id,
    )
    expect(perSubject).toHaveLength(2)
    expect(perSubject.every((row) => row.executions === 2 && row.episodes === 1)).toBe(true)
  })
})
