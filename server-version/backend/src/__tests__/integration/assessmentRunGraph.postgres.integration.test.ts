import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization } from '../../modules/organization/service'
import {
  addAssessmentRunTrackDraft,
  createAssessmentRunDraft,
  insertRunActorSnapshot,
  insertRunExecution,
  insertRunRelationshipSnapshot,
} from '../../modules/assessment-run/repository'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const commandKey = (label: string) => `run-graph-${label}-${suffix}-${randomUUID()}`

async function createUser(label: string) {
  return db.user.create({
    data: {
      username: `run-graph-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
    },
    select: { id: true },
  })
}

const requestedPolicy = {
  subjectRoles: ['STUDENT'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'TEST_VISIBILITY_V1',
  minimumRespondents: null,
}

async function createRunWithTrack(organizationId: string, actorUserId: string, label: string) {
  const run = await createAssessmentRunDraft({
    organizationId,
    name: `run ${label} ${suffix}`,
    createdByUserId: actorUserId,
  })
  const track = await addAssessmentRunTrackDraft({
    organizationId,
    runId: run.id,
    resource: { family: 'BUNDLE', key: `bundle-${label}`, version: '1.0.0' },
    requestedPolicy,
  })
  return { run, track }
}

suite('Assessment Run graph integrity (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('rejects an ORG_MEMBER actor snapshot whose membership and user do not match', async () => {
    const owner = await createUser('mismatch-owner')
    const memberA = await createUser('mismatch-a')
    const memberB = await createUser('mismatch-b')
    const organization = await createOrganization({
      name: `run mismatch ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('mismatch-org') },
    })
    const membershipA = await createMembership({
      organizationId: organization.organization.id,
      userId: memberA.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('mismatch-member-a') },
    })
    const { run } = await createRunWithTrack(organization.organization.id, owner.id, 'mismatch')

    await expect(db.$transaction(async (tx) => insertRunActorSnapshot(tx, {
      organizationId: organization.organization.id,
      runId: run.id,
      provenanceKind: 'ORG_MEMBER',
      userId: memberB.id,
      membershipId: membershipA.id,
      actorRole: 'STUDENT',
      snapshotPayload: { source: 'test', userId: memberB.id, membershipId: membershipA.id },
    }))).rejects.toBeTruthy()
  })

  it('rejects actor and relationship references from another Run', async () => {
    const owner = await createUser('cross-run-owner')
    const subject = await createUser('cross-run-subject')
    const respondent = await createUser('cross-run-respondent')
    const organization = await createOrganization({
      name: `cross run ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('cross-run-org') },
    })
    const subjectMembership = await createMembership({
      organizationId: organization.organization.id,
      userId: subject.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('cross-run-subject') },
    })
    const respondentMembership = await createMembership({
      organizationId: organization.organization.id,
      userId: respondent.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('cross-run-respondent') },
    })
    const runA = await createRunWithTrack(organization.organization.id, owner.id, 'a')
    const runB = await createRunWithTrack(organization.organization.id, owner.id, 'b')

    const actorA = await db.$transaction((tx) => insertRunActorSnapshot(tx, {
      organizationId: organization.organization.id,
      runId: runA.run.id,
      provenanceKind: 'ORG_MEMBER',
      userId: subject.id,
      membershipId: subjectMembership.id,
      actorRole: 'STUDENT',
      snapshotPayload: { run: 'a', subject: subject.id },
    }))
    const actorB = await db.$transaction((tx) => insertRunActorSnapshot(tx, {
      organizationId: organization.organization.id,
      runId: runB.run.id,
      provenanceKind: 'ORG_MEMBER',
      userId: respondent.id,
      membershipId: respondentMembership.id,
      actorRole: 'STUDENT',
      snapshotPayload: { run: 'b', respondent: respondent.id },
    }))

    await expect(db.$transaction((tx) => insertRunRelationshipSnapshot(tx, {
      organizationId: organization.organization.id,
      runId: runA.run.id,
      relationshipKind: 'SELF',
      subjectActorSnapshotId: actorA.id,
      respondentActorSnapshotId: actorB.id,
      snapshotPayload: { invalid: 'cross-run' },
    }))).rejects.toBeTruthy()
  })

  it('enforces one Execution per Track + subject + respondent', async () => {
    const owner = await createUser('forward-owner')
    const subject = await createUser('forward-subject')
    const respondent = await createUser('forward-respondent')
    const organization = await createOrganization({
      name: `forward unique ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('forward-org') },
    })
    const subjectMembership = await createMembership({
      organizationId: organization.organization.id,
      userId: subject.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('forward-subject') },
    })
    const respondentMembership = await createMembership({
      organizationId: organization.organization.id,
      userId: respondent.id,
      meta: { actorUserId: owner.id, commandKey: commandKey('forward-respondent') },
    })
    const { run, track } = await createRunWithTrack(organization.organization.id, owner.id, 'forward')

    const graph = await db.$transaction(async (tx) => {
      const subjectActor = await insertRunActorSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        provenanceKind: 'ORG_MEMBER',
        userId: subject.id,
        membershipId: subjectMembership.id,
        actorRole: 'STUDENT',
        snapshotPayload: { subject: subject.id },
      })
      const respondentActor = await insertRunActorSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        provenanceKind: 'ORG_MEMBER',
        userId: respondent.id,
        membershipId: respondentMembership.id,
        actorRole: 'STUDENT',
        snapshotPayload: { respondent: respondent.id },
      })
      const relationship = await insertRunRelationshipSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        relationshipKind: 'SELF',
        subjectActorSnapshotId: subjectActor.id,
        respondentActorSnapshotId: respondentActor.id,
        snapshotPayload: { kind: 'test' },
      })
      await insertRunExecution(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        trackId: track.id,
        subjectActorSnapshotId: subjectActor.id,
        respondentActorSnapshotId: respondentActor.id,
        relationshipSnapshotId: relationship.id,
      })
      return { subjectActor, respondentActor, relationship }
    })

    await expect(db.$transaction((tx) => insertRunExecution(tx, {
      organizationId: organization.organization.id,
      runId: run.id,
      trackId: track.id,
      subjectActorSnapshotId: graph.subjectActor.id,
      respondentActorSnapshotId: graph.respondentActor.id,
      relationshipSnapshotId: graph.relationship.id,
    }))).rejects.toBeTruthy()
  })

  it('prevents the same runtime binding from belonging to two Executions', async () => {
    const owner = await createUser('runtime-owner')
    const subject = await createUser('runtime-subject')
    const respondentA = await createUser('runtime-a')
    const respondentB = await createUser('runtime-b')
    const organization = await createOrganization({
      name: `runtime reverse ${suffix}`,
      meta: { actorUserId: owner.id, commandKey: commandKey('runtime-org') },
    })
    const memberships = await Promise.all([
      createMembership({ organizationId: organization.organization.id, userId: subject.id, meta: { actorUserId: owner.id, commandKey: commandKey('runtime-subject') } }),
      createMembership({ organizationId: organization.organization.id, userId: respondentA.id, meta: { actorUserId: owner.id, commandKey: commandKey('runtime-a') } }),
      createMembership({ organizationId: organization.organization.id, userId: respondentB.id, meta: { actorUserId: owner.id, commandKey: commandKey('runtime-b') } }),
    ])
    const { run, track } = await createRunWithTrack(organization.organization.id, owner.id, 'runtime')

    await expect(db.$transaction(async (tx) => {
      const subjectActor = await insertRunActorSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        provenanceKind: 'ORG_MEMBER',
        userId: subject.id,
        membershipId: memberships[0].id,
        actorRole: 'STUDENT',
        snapshotPayload: { subject: subject.id },
      })
      const respondentActorA = await insertRunActorSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        provenanceKind: 'ORG_MEMBER',
        userId: respondentA.id,
        membershipId: memberships[1].id,
        actorRole: 'STUDENT',
        snapshotPayload: { respondent: respondentA.id },
      })
      const respondentActorB = await insertRunActorSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        provenanceKind: 'ORG_MEMBER',
        userId: respondentB.id,
        membershipId: memberships[2].id,
        actorRole: 'STUDENT',
        snapshotPayload: { respondent: respondentB.id },
      })
      const relA = await insertRunRelationshipSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        relationshipKind: 'SELF',
        subjectActorSnapshotId: subjectActor.id,
        respondentActorSnapshotId: respondentActorA.id,
        snapshotPayload: { respondent: respondentA.id },
      })
      const relB = await insertRunRelationshipSnapshot(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        relationshipKind: 'SELF',
        subjectActorSnapshotId: subjectActor.id,
        respondentActorSnapshotId: respondentActorB.id,
        snapshotPayload: { respondent: respondentB.id },
      })
      await insertRunExecution(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        trackId: track.id,
        subjectActorSnapshotId: subjectActor.id,
        respondentActorSnapshotId: respondentActorA.id,
        relationshipSnapshotId: relA.id,
        status: 'STARTED',
        runtimeBindingKind: 'COMPOSITE',
        runtimeBindingRef: 'runtime-shared-ref',
        startedAt: new Date(),
      })
      await insertRunExecution(tx, {
        organizationId: organization.organization.id,
        runId: run.id,
        trackId: track.id,
        subjectActorSnapshotId: subjectActor.id,
        respondentActorSnapshotId: respondentActorB.id,
        relationshipSnapshotId: relB.id,
        status: 'STARTED',
        runtimeBindingKind: 'COMPOSITE',
        runtimeBindingRef: 'runtime-shared-ref',
        startedAt: new Date(),
      })
    })).rejects.toBeTruthy()
  })
})
