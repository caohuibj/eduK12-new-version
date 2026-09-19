import { randomUUID } from 'node:crypto'
import { PrismaClient, UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import type { ReportingCohortSnapshotRecord } from '../../modules/reporting/types'
import { integrationDatabaseUrl } from './integration-env'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)

// This is a PR3 privacy/security contract. Local runs without an integration DB
// may skip it, but CI must fail closed rather than silently lose the regression.
const suite = DB_URL || process.env.CI ? describe : describe.skip

let db: PrismaClient
let resolveAuthoritativeRunResults: typeof import('../../modules/reporting/resultSource')['resolveAuthoritativeRunResults']
const ids = {
  owner: randomUUID(),
  subject: randomUUID(),
  organization: randomUUID(),
  membership: randomUUID(),
  run: randomUUID(),
  track: randomUUID(),
  actor: randomUUID(),
  relationship: randomUUID(),
  execution: randomUUID(),
}

suite('PR3 effective Run Track privacy floor (real PostgreSQL)', () => {
  beforeAll(async () => {
    if (!DB_URL) throw new Error('PR3 privacy-floor CI regression requires an integration DATABASE_URL')
    process.env.DATABASE_URL = DB_URL
    db = new PrismaClient({ datasources: { db: { url: DB_URL } } })
    await db.$connect()
    resolveAuthoritativeRunResults = (await import('../../modules/reporting/resultSource')).resolveAuthoritativeRunResults

    await db.user.createMany({
      data: [
        { id: ids.owner, username: `report-floor-owner-${ids.owner}`, passwordHash: 'test-only', role: UserRole.TEACHER },
        { id: ids.subject, username: `report-floor-subject-${ids.subject}`, passwordHash: 'test-only', role: UserRole.STUDENT },
      ],
    })
    await db.organization.create({
      data: { id: ids.organization, name: 'PR3 privacy floor regression', createdByUserId: ids.owner },
    })
    await db.organizationMembership.create({
      data: { id: ids.membership, organizationId: ids.organization, userId: ids.subject, orgRole: 'MEMBER' },
    })

    await db.$executeRawUnsafe(
      `INSERT INTO assessment_runs
        (id, organization_id, name, status, version, created_by_user_id, published_at)
       VALUES ($1,$2,'PR3 privacy floor run','PUBLISHED',1,$3,CURRENT_TIMESTAMP)`,
      ids.run,
      ids.organization,
      ids.owner,
    )
    await db.$executeRawUnsafe(
      `INSERT INTO assessment_run_tracks
        (id, organization_id, run_id, resource_family, resource_key, resource_version,
         subject_selector, respondent_selector, requested_policy, frozen_resource_policy, resource_policy_hash)
       VALUES ($1,$2,$3,'BUNDLE','privacy-floor-fixture','1.0.0','{}'::jsonb,'{}'::jsonb,
         $4::jsonb,$5::jsonb,$6)`,
      ids.track,
      ids.organization,
      ids.run,
      JSON.stringify({ minimumRespondents: 5, perspectives: ['SELF_REPORT'] }),
      JSON.stringify({ minimumRespondents: 3 }),
      canonicalHash({ resource: 'privacy-floor-fixture', minimumRespondents: 3 }),
    )
    await db.$executeRawUnsafe(
      `INSERT INTO assessment_run_actor_snapshots
        (id, organization_id, run_id, provenance_kind, user_id, membership_id, actor_role,
         snapshot_payload, snapshot_hash)
       VALUES ($1,$2,$3,'ORG_MEMBER',$4,$5,'STUDENT',$6::jsonb,$7)`,
      ids.actor,
      ids.organization,
      ids.run,
      ids.subject,
      ids.membership,
      JSON.stringify({ schemaVersion: 1, userId: ids.subject, membershipId: ids.membership, actorRole: 'STUDENT' }),
      canonicalHash({ actor: ids.actor }),
    )
    await db.$executeRawUnsafe(
      `INSERT INTO assessment_run_relationship_snapshots
        (id, organization_id, run_id, relationship_kind, subject_actor_snapshot_id,
         respondent_actor_snapshot_id, snapshot_payload, snapshot_hash)
       VALUES ($1,$2,$3,'SELF',$4,$4,$5::jsonb,$6)`,
      ids.relationship,
      ids.organization,
      ids.run,
      ids.actor,
      JSON.stringify({ schemaVersion: 1, relationshipKind: 'SELF' }),
      canonicalHash({ relationship: ids.relationship }),
    )
    await db.$executeRawUnsafe(
      `INSERT INTO assessment_run_executions
        (id, organization_id, run_id, track_id, subject_actor_snapshot_id,
         respondent_actor_snapshot_id, relationship_snapshot_id, status)
       VALUES ($1,$2,$3,$4,$5,$5,$6,'ASSIGNED')`,
      ids.execution,
      ids.organization,
      ids.run,
      ids.track,
      ids.actor,
      ids.relationship,
    )
  })

  afterAll(async () => {
    if (!db) return
    await db.$executeRawUnsafe('DELETE FROM assessment_run_executions WHERE id=$1', ids.execution)
    await db.$executeRawUnsafe('DELETE FROM assessment_run_relationship_snapshots WHERE id=$1', ids.relationship)
    await db.$executeRawUnsafe('DELETE FROM assessment_run_actor_snapshots WHERE id=$1', ids.actor)
    await db.$executeRawUnsafe('DELETE FROM assessment_run_tracks WHERE id=$1', ids.track)
    await db.$executeRawUnsafe('DELETE FROM assessment_runs WHERE id=$1', ids.run)
    await db.organizationMembership.deleteMany({ where: { id: ids.membership } })
    await db.organization.deleteMany({ where: { id: ids.organization } })
    await db.user.deleteMany({ where: { id: { in: [ids.owner, ids.subject] } } })
    await db.$disconnect()
  })

  it('uses max(resource floor, stricter Track floor) before any result contributes', async () => {
    const cohort: ReportingCohortSnapshotRecord = {
      id: randomUUID(),
      organizationId: ids.organization,
      sourceRunId: ids.run,
      sourceTrackId: ids.track,
      selector: { kind: 'RUN_TRACK_SUBJECTS', runId: ids.run, trackId: ids.track },
      members: [{
        userId: ids.subject,
        membershipId: ids.membership,
        actorSnapshotId: ids.actor,
        executionId: ids.execution,
      }],
      eligibleN: 1,
      cohortIdentityHash: canonicalHash({ cohort: ids.track }),
      snapshotHash: canonicalHash({ snapshot: ids.track }),
      generatedByUserId: ids.owner,
      generatedAt: new Date('2026-09-19T00:00:00.000Z'),
    }

    const batch = await resolveAuthoritativeRunResults(cohort)

    expect(batch.resourceMinimumN).toBe(5)
    expect(batch.resolved).toHaveLength(0)
    expect(batch.unresolved).toEqual([expect.objectContaining({
      executionId: ids.execution,
      subjectUserId: ids.subject,
      membershipId: ids.membership,
      reason: 'NOT_COMPLETED',
    })])
  })
})
