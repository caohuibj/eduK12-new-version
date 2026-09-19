import { relationalFail } from './errors'
import type {
  RelationalActorRoleV1,
  RelationalAnalysisModeV1,
  RelationalAssignmentRecordV1,
  RelationalAssignmentStatusV1,
  RelationalPerspectiveV1,
  RelationalPolicyDomainV1,
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
  applicabilityHash: string | null
  analysisMode: RelationalAnalysisModeV1 | null
  minimumRespondents: number | null
  consentId: string | null
  visibilityPolicyKey: string
  policyDomain: RelationalPolicyDomainV1
  status: RelationalAssignmentStatusV1
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  revokedAt: Date | null
}

type ConsentRow = {
  id: string
  priorConsentId: string | null
  subjectUserId: string | null
  respondentUserId: string | null
  respondentType: string
  consentVersion: string
  purpose: string
  visibilityScope: string
  shareTargetsJson: unknown
  acceptedAt: Date | null
  revokedAt: Date | null
}

export interface ResolvedRelationalConsentV1 {
  consentId: string
  acceptedAt: string
}

const HASH = /^[0-9a-f]{64}$/

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
    applicability_hash AS "applicabilityHash",
    analysis_mode AS "analysisMode",
    minimum_respondents AS "minimumRespondents",
    consent_id AS "consentId",
    visibility_policy_key AS "visibilityPolicyKey",
    policy_domain AS "policyDomain",
    status,
    created_at AS "createdAt",
    started_at AS "startedAt",
    completed_at AS "completedAt",
    revoked_at AS "revokedAt"
  FROM relational_assessment_assignments
`

const SELECT_CONSENT = `
  SELECT
    id,
    prior_consent_id AS "priorConsentId",
    subject_user_id AS "subjectUserId",
    respondent_user_id AS "respondentUserId",
    respondent_type AS "respondentType",
    consent_version AS "consentVersion",
    purpose,
    visibility_scope AS "visibilityScope",
    share_targets_json AS "shareTargetsJson",
    accepted_at AS "acceptedAt",
    revoked_at AS "revokedAt"
  FROM assessment_attempt_consents
`

const iso = (value: Date | null): string | null => value ? value.toISOString() : null

const validateFrozenAnalysisContract = (row: AssignmentRow): {
  applicabilityHash: string
  analysisMode: 'INDIVIDUAL_ONLY' | 'COHORT_AGGREGATE'
  minimumRespondents: number | null
} => {
  if (!row.applicabilityHash || !HASH.test(row.applicabilityHash)) {
    return relationalFail('RELATIONAL_ASSIGNMENT_CONTRACT', 'assignment is missing a valid frozen applicability hash')
  }
  if (row.analysisMode !== 'INDIVIDUAL_ONLY' && row.analysisMode !== 'COHORT_AGGREGATE') {
    return relationalFail('RELATIONAL_ASSIGNMENT_CONTRACT', 'assignment is missing a supported frozen analysis mode')
  }
  if (row.analysisMode === 'COHORT_AGGREGATE') {
    if (!Number.isInteger(row.minimumRespondents) || (row.minimumRespondents ?? 0) < 3) {
      return relationalFail('RELATIONAL_ASSIGNMENT_CONTRACT', 'cohort assignment is missing a valid frozen minimumRespondents')
    }
  } else if (row.minimumRespondents !== null) {
    return relationalFail('RELATIONAL_ASSIGNMENT_CONTRACT', 'individual assignment must freeze minimumRespondents=null')
  }
  return {
    applicabilityHash: row.applicabilityHash,
    analysisMode: row.analysisMode,
    minimumRespondents: row.minimumRespondents,
  }
}

const toRecord = (row: AssignmentRow): RelationalAssignmentRecordV1 => {
  const analysis = validateFrozenAnalysisContract(row)
  return {
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
    applicabilityHash: analysis.applicabilityHash,
    analysisMode: analysis.analysisMode,
    minimumRespondents: analysis.minimumRespondents,
    consentId: row.consentId,
    visibilityPolicyKey: row.visibilityPolicyKey,
    policyDomain: row.policyDomain,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    revokedAt: iso(row.revokedAt),
  }
}

const expectedConsentRespondentType = (assignment: RelationalAssignmentRecordV1): string | null => {
  if (assignment.relationshipKind === 'SELF') return 'SELF'
  if (assignment.respondentRole === 'PARENT') return 'PARENT'
  if (assignment.respondentRole === 'TEACHER') return 'TEACHER'
  return null
}

const expectedConsentScope = (assignment: RelationalAssignmentRecordV1): string | null => {
  if (assignment.visibilityPolicyKey === 'observer_private_respondent_v1') return 'PRIVATE_RESPONDENT'
  if (assignment.visibilityPolicyKey === 'observer_assigning_teacher_v1') return 'ASSIGNING_TEACHER'
  if (assignment.visibilityPolicyKey === 'observer_shared_course_lead_v1') return 'SHARED_COURSE_LEAD'
  return null
}

const expectedConsentPurpose = (assignment: RelationalAssignmentRecordV1): string | null => {
  if (
    assignment.visibilityPolicyKey === 'observer_private_respondent_v1'
    && assignment.respondentRole === 'PARENT'
    && assignment.createdByUserId === assignment.respondentUserId
  ) return 'parent_self_serve_observer'
  if (
    assignment.visibilityPolicyKey === 'observer_assigning_teacher_v1'
    && assignment.respondentRole === 'PARENT'
    && assignment.createdByUserId !== assignment.respondentUserId
  ) return 'teacher_assigned_parent_observer'
  if (
    assignment.visibilityPolicyKey === 'observer_assigning_teacher_v1'
    && assignment.respondentRole === 'TEACHER'
    && assignment.createdByUserId === assignment.respondentUserId
  ) return 'teacher_self_report_observer'
  if (
    assignment.visibilityPolicyKey === 'observer_shared_course_lead_v1'
    && assignment.respondentRole === 'PARENT'
  ) return 'parent_share_to_course_lead'
  return null
}

const stableJson = (value: unknown): string => JSON.stringify(value ?? null)

const assertConsentRootMatchesAssignment = (
  assignment: RelationalAssignmentRecordV1,
  consent: ConsentRow,
): void => {
  const respondentType = expectedConsentRespondentType(assignment)
  const visibilityScope = expectedConsentScope(assignment)
  const purpose = expectedConsentPurpose(assignment)
  if (!respondentType || !visibilityScope || !purpose) {
    relationalFail('RELATIONAL_CONSENT_BINDING', 'assignment does not declare a supported consent contract')
  }
  if (
    consent.subjectUserId !== assignment.subjectUserId
    || consent.respondentUserId !== assignment.respondentUserId
    || consent.respondentType !== respondentType
    || consent.visibilityScope !== visibilityScope
    || consent.purpose !== purpose
  ) {
    relationalFail('RELATIONAL_CONSENT_BINDING', 'consent identity/purpose/visibility does not match assignment')
  }
}

const assertAcceptedLineageMatchesRoot = (root: ConsentRow, accepted: ConsentRow): void => {
  if (
    accepted.priorConsentId !== root.id
    || accepted.subjectUserId !== root.subjectUserId
    || accepted.respondentUserId !== root.respondentUserId
    || accepted.respondentType !== root.respondentType
    || accepted.consentVersion !== root.consentVersion
    || accepted.purpose !== root.purpose
    || accepted.visibilityScope !== root.visibilityScope
    || stableJson(accepted.shareTargetsJson) !== stableJson(root.shareTargetsJson)
  ) {
    relationalFail('RELATIONAL_CONSENT_BINDING', 'accepted consent lineage does not preserve the issued consent contract')
  }
}

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
  resolveAcceptedConsent(assignment: RelationalAssignmentRecordV1): Promise<ResolvedRelationalConsentV1 | null>
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
        applicability_hash, analysis_mode, minimum_respondents,
        consent_id, visibility_policy_key, policy_domain, status, created_at, updated_at, started_at, completed_at, revoked_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23::timestamp,$23::timestamp,$24::timestamp,$25::timestamp,$26::timestamp
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
      assignment.applicabilityHash,
      assignment.analysisMode,
      assignment.minimumRespondents,
      assignment.consentId,
      assignment.visibilityPolicyKey,
      assignment.policyDomain ?? 'LEGACY_COURSE',
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

  async resolveAcceptedConsent(assignment) {
    if (!assignment.consentId) return null
    const roots = await db.$queryRawUnsafe<ConsentRow[]>(`${SELECT_CONSENT} WHERE id = $1 LIMIT 1`, assignment.consentId)
    const root = roots[0]
    if (!root) relationalFail('RELATIONAL_CONSENT_NOT_FOUND', 'consent record not found')
    if (root.priorConsentId !== null) {
      relationalFail('RELATIONAL_CONSENT_BINDING', 'assignment consentId must reference the issuance/root consent row')
    }
    if (root.revokedAt) relationalFail('RELATIONAL_CONSENT_REVOKED', 'consent has been revoked')
    assertConsentRootMatchesAssignment(assignment, root)
    if (root.acceptedAt) {
      return { consentId: root.id, acceptedAt: root.acceptedAt.toISOString() }
    }

    const acceptedRows = await db.$queryRawUnsafe<ConsentRow[]>(
      `${SELECT_CONSENT}
       WHERE prior_consent_id = $1 AND accepted_at IS NOT NULL
       ORDER BY created_at ASC LIMIT 2`,
      root.id,
    )
    if (acceptedRows.length === 0) return null
    if (acceptedRows.length > 1) {
      relationalFail('RELATIONAL_CONSENT_LINEAGE', 'consent lineage contains multiple acceptance rows')
    }
    const accepted = acceptedRows[0]
    if (accepted.revokedAt) relationalFail('RELATIONAL_CONSENT_REVOKED', 'accepted consent has been revoked')
    assertAcceptedLineageMatchesRoot(root, accepted)
    return { consentId: accepted.id, acceptedAt: accepted.acceptedAt!.toISOString() }
  },
})
