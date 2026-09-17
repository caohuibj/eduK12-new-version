import { relationalFail } from './errors'
import type {
  RelationalActorRoleV1,
  RelationalAssignmentRecordV1,
  RelationalAssignmentStatusV1,
  RelationalPerspectiveV1,
  RelationalRelationshipKindV1,
  RelationalRelationshipSnapshotV1,
  RelationalResourceKindV1,
} from './types'

export interface RelationalSqlClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

type AssignmentRow = {
  id: string
  episodeId: string
  subjectUserId: string
  subjectRole: RelationalActorRoleV1
  respondentUserId: string
  respondentRole: RelationalActorRoleV1
  createdByUserId: string
  relationshipKind: RelationalRelationshipKindV1
  relationshipRef: string | null
  relationshipSnapshotJson: RelationalRelationshipSnapshotV1
  relationshipSnapshotHash: string
  perspective: RelationalPerspectiveV1
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
  consentId: string | null
  visibilityPolicyKey: string
  status: RelationalAssignmentStatusV1
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  revokedAt: Date | null
}

const SELECT_ASSIGNMENT = `
  SELECT
    id,
    episode_id AS "episodeId",
    subject_user_id AS "subjectUserId",
    subject_role AS "subjectRole",
    respondent_user_id AS "respondentUserId",
    respondent_role AS "respondentRole",
    created_by_user_id AS "createdByUserId",
    relationship_kind AS "relationshipKind",
    relationship_ref AS "relationshipRef",
    relationship_snapshot_json AS "relationshipSnapshotJson",
    relationship_snapshot_hash AS "relationshipSnapshotHash",
    perspective,
    resource_kind AS "resourceKind",
    resource_key AS "resourceKey",
    resource_version AS "resourceVersion",
    consent_id AS "consentId",
    visibility_policy_key AS "visibilityPolicyKey",
    status,
    created_at AS "createdAt",
    started_at AS "startedAt",
    completed_at AS "completedAt",
    revoked_at AS "revokedAt"
  FROM relational_assessment_assignments
`

const iso = (value: Date | null): string | null => value ? value.toISOString() : null

const toRecord = (row: AssignmentRow): RelationalAssignmentRecordV1 => ({
  assignmentId: row.id,
  episodeId: row.episodeId,
  subjectUserId: row.subjectUserId,
  subjectRole: row.subjectRole,
  respondentUserId: row.respondentUserId,
  respondentRole: row.respondentRole,
  createdByUserId: row.createdByUserId,
  relationshipKind: row.relationshipKind,
  relationshipRef: row.relationshipRef,
  relationshipSnapshot: row.relationshipSnapshotJson,
  relationshipSnapshotHash: row.relationshipSnapshotHash,
  perspective: row.perspective,
  resourceKind: row.resourceKind,
  resourceKey: row.resourceKey,
  resourceVersion: row.resourceVersion,
  consentId: row.consentId,
  visibilityPolicyKey: row.visibilityPolicyKey,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  startedAt: iso(row.startedAt),
  completedAt: iso(row.completedAt),
  revokedAt: iso(row.revokedAt),
})

export interface RelationalAssignmentRepository {
  create(assignment: RelationalAssignmentRecordV1): Promise<void>
  findById(assignmentId: string): Promise<RelationalAssignmentRecordV1 | null>
  listForRespondent(respondentUserId: string, limit?: number): Promise<RelationalAssignmentRecordV1[]>
  listForSubject(subjectUserId: string, limit?: number): Promise<RelationalAssignmentRecordV1[]>
  transition(input: {
    assignmentId: string
    from: RelationalAssignmentStatusV1
    to: RelationalAssignmentStatusV1
    at: string
  }): Promise<boolean>
  consentAcceptedAt(consentId: string): Promise<string | null>
}

export const createSqlRelationalAssignmentRepository = (
  db: RelationalSqlClient,
): RelationalAssignmentRepository => ({
  async create(assignment) {
    await db.$executeRawUnsafe(
      `INSERT INTO relational_assessment_assignments (
        id, episode_id, subject_user_id, subject_role, respondent_user_id, respondent_role,
        created_by_user_id, relationship_kind, relationship_ref, relationship_snapshot_json,
        relationship_snapshot_hash, perspective, resource_kind, resource_key, resource_version,
        consent_id, visibility_policy_key, status, created_at, updated_at, started_at, completed_at, revoked_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19::timestamp,$19::timestamp,$20::timestamp,$21::timestamp,$22::timestamp
      )`,
      assignment.assignmentId,
      assignment.episodeId,
      assignment.subjectUserId,
      assignment.subjectRole,
      assignment.respondentUserId,
      assignment.respondentRole,
      assignment.createdByUserId,
      assignment.relationshipKind,
      assignment.relationshipRef,
      JSON.stringify(assignment.relationshipSnapshot),
      assignment.relationshipSnapshotHash,
      assignment.perspective,
      assignment.resourceKind,
      assignment.resourceKey,
      assignment.resourceVersion,
      assignment.consentId,
      assignment.visibilityPolicyKey,
      assignment.status,
      assignment.createdAt,
      assignment.startedAt,
      assignment.completedAt,
      assignment.revokedAt,
    )
  },

  async findById(assignmentId) {
    const rows = await db.$queryRawUnsafe<AssignmentRow[]>(`${SELECT_ASSIGNMENT} WHERE id = $1 LIMIT 1`, assignmentId)
    return rows[0] ? toRecord(rows[0]) : null
  },

  async listForRespondent(respondentUserId, limit = 100) {
    const bounded = Math.max(1, Math.min(200, Math.trunc(limit)))
    const rows = await db.$queryRawUnsafe<AssignmentRow[]>(
      `${SELECT_ASSIGNMENT} WHERE respondent_user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      respondentUserId,
      bounded,
    )
    return rows.map(toRecord)
  },

  async listForSubject(subjectUserId, limit = 100) {
    const bounded = Math.max(1, Math.min(200, Math.trunc(limit)))
    const rows = await db.$queryRawUnsafe<AssignmentRow[]>(
      `${SELECT_ASSIGNMENT} WHERE subject_user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      subjectUserId,
      bounded,
    )
    return rows.map(toRecord)
  },

  async transition(input) {
    const column = input.to === 'STARTED'
      ? 'started_at'
      : input.to === 'COMPLETED'
        ? 'completed_at'
        : input.to === 'REVOKED'
          ? 'revoked_at'
          : null
    const timestampWrite = column ? `, ${column} = $4::timestamp` : ''
    const changed = await db.$executeRawUnsafe(
      `UPDATE relational_assessment_assignments
       SET status = $2, updated_at = $4::timestamp${timestampWrite}
       WHERE id = $1 AND status = $3`,
      input.assignmentId,
      input.to,
      input.from,
      input.at,
    )
    return changed === 1
  },

  async consentAcceptedAt(consentId) {
    const rows = await db.$queryRawUnsafe<Array<{ acceptedAt: Date | null; revokedAt: Date | null }>>(
      `SELECT accepted_at AS "acceptedAt", revoked_at AS "revokedAt"
       FROM assessment_attempt_consents WHERE id = $1 LIMIT 1`,
      consentId,
    )
    const row = rows[0]
    if (!row) relationalFail('RELATIONAL_CONSENT_NOT_FOUND', 'consent record not found')
    if (row.revokedAt) relationalFail('RELATIONAL_CONSENT_REVOKED', 'consent has been revoked')
    return row.acceptedAt?.toISOString() ?? null
  },
})
