import type { ScaleReferenceIdentityV1 } from '../../modules/assessment-reference/longitudinal'
import type { ResultDisclosureContractV1 } from '../../modules/assessment-policy/result-disclosure'
import { randomUUID } from 'node:crypto'
import {
  AssessmentUnitPayloadKind,
  AssessmentUnitTerminalState,
  AssessmentUnitType,
  CompositeAssessmentAttemptStatus,
  CompositeAssessmentStatus,
  InstrumentDeliveryMode,
  RuntimeGeneration,
  UserRole,
  type PrismaClient,
} from '@prisma/client'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import type { ReportingCohortSnapshotRecord } from '../../modules/reporting/types'
type FixtureMember = {
  userId: string
  membershipId: string
  actorSnapshotId: string
  relationshipSnapshotId: string
  executionId: string
  attemptId: string
}
type PopulationFixture = {
  ownerId: string
  organizationId: string
  runId: string
  trackId: string
  compositeId: string
  members: FixtureMember[]
  cohort: ReportingCohortSnapshotRecord
}

export const buildReportingFixture = async (prisma: PrismaClient, population: number, protectedSubject = false, repeated?: {
  ownerId: string; organizationId: string; members: Array<{ userId: string; membershipId: string }>; resourceKey: string; at: Date; resourceVersion?: string
}, resultDisclosure?: ResultDisclosureContractV1, scalePoint?:{identity:ScaleReferenceIdentityV1;value:number}): Promise<PopulationFixture> => {
  const prefix = `reporting-qb-${population}-${randomUUID().slice(0, 8)}`
  const ownerId = repeated?.ownerId ?? randomUUID()
  const organizationId = repeated?.organizationId ?? randomUUID()
  const runId = randomUUID()
  const trackId = randomUUID()
  const compositeId = randomUUID()
  const subjectActorId = randomUUID()
  const now = repeated?.at ?? new Date('2026-09-19T00:00:00.000Z')
  const resourceKey = repeated?.resourceKey ?? `${prefix}-resource`
  const resourceVersion = repeated?.resourceVersion ?? '1.0.0'
  const members: FixtureMember[] = Array.from({ length: population }, (_, i) => ({
    userId: repeated?.members[i].userId ?? randomUUID(),
    membershipId: repeated?.members[i].membershipId ?? randomUUID(),
    actorSnapshotId: randomUUID(),
    relationshipSnapshotId: randomUUID(),
    executionId: randomUUID(),
    attemptId: randomUUID(),
  }))

  if (!repeated) {
  await prisma.user.create({
    data: {
      id: ownerId,
      username: `${prefix}-owner`,
      passwordHash: 'query-budget-only',
      role: UserRole.TEACHER,
    },
  })
  await prisma.user.createMany({
    data: members.map((member, index) => ({
      id: member.userId,
      username: `${prefix}-subject-${index}`,
      passwordHash: 'query-budget-only',
      role: UserRole.STUDENT,
    })),
  })
  await prisma.organization.create({
    data: {
      id: organizationId,
      name: `${prefix}-organization`,
      createdByUserId: ownerId,
    },
  })
  await prisma.organizationMembership.createMany({
    data: members.map((member) => ({
      id: member.membershipId,
      organizationId,
      userId: member.userId,
      orgRole: 'MEMBER',
    })),
  })

  }

  const frozenPolicy = resultDisclosure ? { minimumRespondents: resultDisclosure.minimumRespondents, resultDisclosure } : { minimumRespondents: 3 }
  const resourcePolicyHash = resultDisclosure ? canonicalHash(frozenPolicy) : canonicalHash({ prefix, policy: 'reporting-query-budget' })
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_runs
      (id, organization_id, name, status, version, created_by_user_id, published_at)
     VALUES ($1,$2,$3,'PUBLISHED',1,$4,$5)`,
    runId,
    organizationId,
    `${prefix}-run`,
    ownerId,
    now,
  )
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_tracks
      (id, organization_id, run_id, resource_family, resource_key, resource_version,
       subject_selector, respondent_selector, requested_policy, frozen_resource_policy, resource_policy_hash)
     VALUES ($1,$2,$3,'BUNDLE',$4,$8,'{}'::jsonb,'{}'::jsonb,$5::jsonb,$6::jsonb,$7)`,
    trackId,
    organizationId,
    runId,
    resourceKey,
    JSON.stringify({ analysisMode: protectedSubject ? 'COHORT_AGGREGATE' : 'INDIVIDUAL_ONLY', perspectives: [protectedSubject ? 'RELATIONAL_EXPERIENCE' : 'SELF_REPORT'] }),
    JSON.stringify(frozenPolicy),
    resourcePolicyHash,
    resourceVersion,
  )

  const graphRows = members.map((member) => ({
    user_id: member.userId,
    membership_id: member.membershipId,
    actor_id: member.actorSnapshotId,
    subject_actor_id: protectedSubject ? subjectActorId : member.actorSnapshotId,
    relationship_id: member.relationshipSnapshotId,
    execution_id: member.executionId,
    attempt_id: member.attemptId,
  }))
  const graphJson = JSON.stringify(graphRows)
  const snapshotHash = canonicalHash({ prefix, kind: 'actor' })
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_actor_snapshots
      (id, organization_id, run_id, provenance_kind, user_id, membership_id, actor_role,
       external_relationship_ref, snapshot_payload, snapshot_hash)
     SELECT x.actor_id, $1, $2, 'ORG_MEMBER', x.user_id, x.membership_id, 'STUDENT', NULL,
       jsonb_build_object('schemaVersion',1,'userId',x.user_id,'membershipId',x.membership_id,'actorRole','STUDENT'),
       $3
     FROM jsonb_to_recordset($4::jsonb)
       AS x(user_id text, membership_id text, actor_id text, subject_actor_id text, relationship_id text, execution_id text, attempt_id text)`,
    organizationId,
    runId,
    snapshotHash,
    graphJson,
  )
  if (protectedSubject) {
    const membership = await prisma.organizationMembership.create({ data: { id: randomUUID(), organizationId, userId: ownerId, orgRole: 'ORG_ADMIN' } })
    await prisma.$executeRawUnsafe(
      `INSERT INTO assessment_run_actor_snapshots
       (id,organization_id,run_id,provenance_kind,user_id,membership_id,actor_role,snapshot_payload,snapshot_hash)
       VALUES ($1,$2,$3,'ORG_MEMBER',$4,$5,'TEACHER','{}'::jsonb,$6)`,
      subjectActorId, organizationId, runId, ownerId, membership.id, snapshotHash,
    )
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_relationship_snapshots
      (id, organization_id, run_id, relationship_kind, relationship_ref,
       subject_actor_snapshot_id, respondent_actor_snapshot_id, snapshot_payload, snapshot_hash)
     SELECT x.relationship_id, $1, $2, '${protectedSubject ? 'CLASS_TEACHER_STUDENT' : 'SELF'}', NULL, x.subject_actor_id, x.actor_id,
       jsonb_build_object('schemaVersion',1,'relationshipKind','${protectedSubject ? 'CLASS_TEACHER_STUDENT' : 'SELF'}','subjectActorSnapshotId',x.subject_actor_id,'respondentActorSnapshotId',x.actor_id),
       $3
     FROM jsonb_to_recordset($4::jsonb)
       AS x(user_id text, membership_id text, actor_id text, subject_actor_id text, relationship_id text, execution_id text, attempt_id text)`,
    organizationId,
    runId,
    canonicalHash({ prefix, kind: 'relationship' }),
    graphJson,
  )
  const scientificProvenance = {
    schemaVersion: 1,
    resourceFamily: 'BUNDLE',
    resourceKey,
    resourceVersion,
    resourcePolicyHash,
    scientificMaturity: 'PILOT',
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_executions
      (id, organization_id, run_id, track_id, subject_actor_snapshot_id, respondent_actor_snapshot_id,
       relationship_snapshot_id, status, relational_assignment_id, runtime_binding_kind, runtime_binding_ref,
       started_at, completed_at, scientific_maturity, scientific_provenance, scientific_provenance_hash, scientific_frozen_at)
     SELECT x.execution_id, $1, $2, $3, x.subject_actor_id, x.actor_id, x.relationship_id,
       'COMPLETED', NULL, 'COMPOSITE', x.attempt_id, $4, $4,
       'PILOT', $5::jsonb, $6, $4
     FROM jsonb_to_recordset($7::jsonb)
       AS x(user_id text, membership_id text, actor_id text, subject_actor_id text, relationship_id text, execution_id text, attempt_id text)`,
    organizationId,
    runId,
    trackId,
    now,
    JSON.stringify(scientificProvenance),
    canonicalHash(scientificProvenance),
    graphJson,
  )

  await prisma.compositeAssessment.create({
    data: {
      id: compositeId,
      code: `${prefix}-composite`,
      name: `${prefix}-composite`,
      status: CompositeAssessmentStatus.PUBLISHED,
      createdBy: ownerId,
      publishedAt: now,
    },
  })
  await prisma.compositeAssessmentAttempt.createMany({
    data: members.map((member, index) => ({
      id: member.attemptId,
      compositeAssessmentId: compositeId,
      userId: member.userId,
      participantKey: `${prefix}:subject:${index}`,
      status: CompositeAssessmentAttemptStatus.COMPLETED,
      deliveryMode: InstrumentDeliveryMode.FINAL_ONLY,
      runtimeGeneration: RuntimeGeneration.UNIFIED_V1,
      attemptEpoch: 1,
      progress: 100,
      completedItems: 1,
      completedAt: now,
      subjectUserId: protectedSubject ? ownerId : member.userId,
      respondentUserId: member.userId,
      assignmentRef: null,
      consentId: null,
    })),
  })

  const instrumentKey = scalePoint?.identity.instrumentKey ?? `${prefix}-instrument`
  const sourceDefinitionHash = scalePoint?.identity.measurementHash ?? canonicalHash({ prefix, definition: 1 })
  const compiledRuntimeHash = canonicalHash({ prefix, runtime: 1 })
  const envelope = createCanonicalUnitResultEnvelope({
    core: {
      schemaVersion: 1,
      unitType: 'SCALE',
      instrumentKey,
      instrumentVersion: '1.0.0',
      sourceDefinitionHash,
      compilerVersion: 'reporting-query-budget-test',
      compiledRuntimeHash,
      scorerKey: 'reporting-query-budget-test',
      scorerVersion: '1.0.0',
      quality: { status: 'interpretable', flags: [] },
      metrics: [{ key: 'score', value: scalePoint?.value??1, unit: 'score', quality: 'calculated',...(scalePoint?{scaleReference:scalePoint.identity}:{}) }],
      facts: [],
      references: scalePoint?[{key:`score:${scalePoint.identity.originalReferenceVersion}:theoretical_range`,referenceVersion:scalePoint.identity.originalReferenceVersion,referenceHash:scalePoint.identity.originalReferenceHash,classification:'theoretical_range',scoreKey:'score',status:'available',value:scalePoint.value,z:null,percentile:null}]:[],
      contextHash: null,
      scientificProvenance: { instrumentKey, instrumentVersion: '1.0.0' },
    },
    completedAt: now,
    persistenceProvenance: {
      sourceType: 'ASSESSMENT',
      sourceAttemptId: `${prefix}-source`,
    },
  })
  const encrypted = encryptUnifiedRuntimePayload(envelope)
  await prisma.assessmentUnitSnapshot.createMany({
    data: members.map((member) => ({
      compositeAttemptId: member.attemptId,
      attemptEpoch: 1,
      slotKey: 'scale:reporting-query-budget',
      unitType: AssessmentUnitType.SCALE,
      terminalState: AssessmentUnitTerminalState.COMPLETED,
      payloadKind: AssessmentUnitPayloadKind.UNIT_RESULT,
      sourceType: 'ASSESSMENT',
      sourceAttemptId: `${prefix}-source`,
      sourceDefinitionHash,
      compiledRuntimeHash,
      canonicalResultEncrypted: encrypted,
      completedAt: now,
    })),
  })

  const cohort: ReportingCohortSnapshotRecord = {
    id: randomUUID(),
    organizationId,
    sourceRunId: runId,
    sourceTrackId: trackId,
    selector: { kind: 'RUN_TRACK_SUBJECTS', runId, trackId },
    members: members.map((member) => ({
      userId: member.userId,
      membershipId: member.membershipId,
      actorSnapshotId: member.actorSnapshotId,
      executionId: member.executionId,
    })),
    eligibleN: population,
    cohortIdentityHash: canonicalHash({ prefix, population, identity: 'cohort' }),
    snapshotHash: canonicalHash({ prefix, population, identity: 'snapshot' }),
    generatedByUserId: ownerId,
    generatedAt: now,
  }
  const fixture = { ownerId, organizationId, runId, trackId, compositeId, members, cohort }
  return fixture
}

