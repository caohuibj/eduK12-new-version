import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization } from '../../modules/organization/service'
import {
  addAssessmentRunTrackDraft,
  createAssessmentRunDraft,
  insertRunActorSnapshot,
} from '../../modules/assessment-run/repository'
import { getOrCreateOrganizationEpisodeAllocation } from '../../modules/assessment-run/episodeAllocation'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `episode-allocation-${label}-${suffix}-${randomUUID()}`

async function createUser(label: string) {
  return db.user.create({
    data: {
      username: `episode-allocation-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
    },
    select: { id: true },
  })
}

const requestedPolicy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'TEST_VISIBILITY_V1', minimumRespondents: null,
}

suite('Organization Episode allocation (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('reuses exactly one Episode for the same Run + Track + subject under concurrent retry', async () => {
    const owner = await createUser('reuse-owner')
    const subject = await createUser('reuse-subject')
    const org = await createOrganization({ name: `episode reuse ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('reuse-org') } })
    const membership = await createMembership({ organizationId: org.organization.id, userId: subject.id, meta: { actorUserId: owner.id, commandKey: key('reuse-member') } })
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'reuse', createdByUserId: owner.id })
    const track = await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'bundle-reuse', version: '1.0.0' }, requestedPolicy })
    const actor = await db.$transaction((tx) => insertRunActorSnapshot(tx, {
      organizationId: org.organization.id, runId: run.id, provenanceKind: 'ORG_MEMBER',
      userId: subject.id, membershipId: membership.id, actorRole: 'STUDENT', snapshotPayload: { subject: subject.id },
    }))

    const [a, b] = await Promise.all([
      getOrCreateOrganizationEpisodeAllocation({ organizationId: org.organization.id, runId: run.id, trackId: track.id, subjectActorSnapshotId: actor.id, initiatedByUserId: owner.id }),
      getOrCreateOrganizationEpisodeAllocation({ organizationId: org.organization.id, runId: run.id, trackId: track.id, subjectActorSnapshotId: actor.id, initiatedByUserId: owner.id }),
    ])
    expect(a.assessmentEpisodeId).toBe(b.assessmentEpisodeId)

    const episodes = await db.$queryRawUnsafe<Array<{ subjectUserId: string | null; courseId: string | null; campaignKey: string | null; initiationMode: string }>>(
      `SELECT subject_user_id AS "subjectUserId", course_id AS "courseId", campaign_key AS "campaignKey", initiation_mode::text AS "initiationMode" FROM assessment_episodes WHERE id=$1`,
      a.assessmentEpisodeId,
    )
    expect(episodes).toHaveLength(1)
    expect(episodes[0]).toEqual({ subjectUserId: subject.id, courseId: null, campaignKey: null, initiationMode: 'ORGANIZATION_RUN' })
  })

  it('allocates distinct Episodes for different subjects even if a respondent could later be shared', async () => {
    const owner = await createUser('subject-owner')
    const subjectA = await createUser('subject-a')
    const subjectB = await createUser('subject-b')
    const org = await createOrganization({ name: `episode subjects ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('subjects-org') } })
    const memberships = await Promise.all([
      createMembership({ organizationId: org.organization.id, userId: subjectA.id, meta: { actorUserId: owner.id, commandKey: key('subject-a') } }),
      createMembership({ organizationId: org.organization.id, userId: subjectB.id, meta: { actorUserId: owner.id, commandKey: key('subject-b') } }),
    ])
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'subjects', createdByUserId: owner.id })
    const track = await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'bundle-subjects', version: '1.0.0' }, requestedPolicy })
    const actors = await db.$transaction(async (tx) => Promise.all([
      insertRunActorSnapshot(tx, { organizationId: org.organization.id, runId: run.id, provenanceKind: 'ORG_MEMBER', userId: subjectA.id, membershipId: memberships[0].id, actorRole: 'STUDENT', snapshotPayload: { subject: 'a' } }),
      insertRunActorSnapshot(tx, { organizationId: org.organization.id, runId: run.id, provenanceKind: 'ORG_MEMBER', userId: subjectB.id, membershipId: memberships[1].id, actorRole: 'STUDENT', snapshotPayload: { subject: 'b' } }),
    ]))
    const allocations = await Promise.all(actors.map((actor) => getOrCreateOrganizationEpisodeAllocation({ organizationId: org.organization.id, runId: run.id, trackId: track.id, subjectActorSnapshotId: actor.id, initiatedByUserId: owner.id })))
    expect(allocations[0].assessmentEpisodeId).not.toBe(allocations[1].assessmentEpisodeId)
  })

  it('allocates distinct Episodes for the same subject on different Tracks', async () => {
    const owner = await createUser('track-owner')
    const subject = await createUser('track-subject')
    const org = await createOrganization({ name: `episode tracks ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('tracks-org') } })
    const membership = await createMembership({ organizationId: org.organization.id, userId: subject.id, meta: { actorUserId: owner.id, commandKey: key('tracks-member') } })
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'tracks', createdByUserId: owner.id })
    const trackA = await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'bundle-a', version: '1.0.0' }, requestedPolicy })
    const trackB = await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'bundle-b', version: '1.0.0' }, requestedPolicy })
    const actor = await db.$transaction((tx) => insertRunActorSnapshot(tx, { organizationId: org.organization.id, runId: run.id, provenanceKind: 'ORG_MEMBER', userId: subject.id, membershipId: membership.id, actorRole: 'STUDENT', snapshotPayload: { subject: subject.id } }))
    const [a, b] = await Promise.all([
      getOrCreateOrganizationEpisodeAllocation({ organizationId: org.organization.id, runId: run.id, trackId: trackA.id, subjectActorSnapshotId: actor.id, initiatedByUserId: owner.id }),
      getOrCreateOrganizationEpisodeAllocation({ organizationId: org.organization.id, runId: run.id, trackId: trackB.id, subjectActorSnapshotId: actor.id, initiatedByUserId: owner.id }),
    ])
    expect(a.assessmentEpisodeId).not.toBe(b.assessmentEpisodeId)
  })

  it('rejects a direct SQL allocation to a non-ORGANIZATION_RUN Episode', async () => {
    const owner = await createUser('guard-owner')
    const subject = await createUser('guard-subject')
    const org = await createOrganization({ name: `episode guard ${suffix}`, meta: { actorUserId: owner.id, commandKey: key('guard-org') } })
    const membership = await createMembership({ organizationId: org.organization.id, userId: subject.id, meta: { actorUserId: owner.id, commandKey: key('guard-member') } })
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: 'guard', createdByUserId: owner.id })
    const track = await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: 'bundle-guard', version: '1.0.0' }, requestedPolicy })
    const actor = await db.$transaction((tx) => insertRunActorSnapshot(tx, { organizationId: org.organization.id, runId: run.id, provenanceKind: 'ORG_MEMBER', userId: subject.id, membershipId: membership.id, actorRole: 'STUDENT', snapshotPayload: { subject: subject.id } }))
    const legacyEpisode = await db.assessmentEpisode.create({ data: { subjectUserId: subject.id, initiatedByUserId: owner.id, initiationMode: 'STUDENT_SELF' } })

    await expect(db.$executeRawUnsafe(
      `INSERT INTO "organization_episode_allocations" ("id","organization_id","run_id","track_id","subject_actor_snapshot_id","assessment_episode_id") VALUES ($1,$2,$3,$4,$5,$6)`,
      randomUUID(), org.organization.id, run.id, track.id, actor.id, legacyEpisode.id,
    )).rejects.toBeTruthy()
  })
})
