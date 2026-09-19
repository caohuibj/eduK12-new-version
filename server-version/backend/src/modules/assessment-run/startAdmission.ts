import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { RespondentTypeV1 } from '../assessment-identity/types'
import {
  createSqlRelationalAssignmentRepository,
  type RelationalAssignmentRepository,
} from '../assessment-relational/repository'
import type { RelationalAssignmentRecordV1 } from '../assessment-relational/types'

export class RunStartAdmissionError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunStartAdmissionError'
  }
}

type Tx = Prisma.TransactionClient

type ExecutionAdmissionRow = {
  executionId: string
  organizationId: string
  runId: string
  trackId: string
  executionStatus: string
  runStatus: string
  relationalAssignmentId: string | null
  policyDomain: string | null
  respondentUserId: string
  runtimeBindingKind: string | null
  runtimeBindingRef: string | null
}

export interface RunAttemptIdentityBinding {
  subjectUserId: string
  respondentUserId: string
  respondentType: RespondentTypeV1 | null
  episodeId: string
  assignmentRef: string
  /** Actual accepted consent row frozen at first START admission. */
  consentId: string | null
}

export interface RunStartAdmission {
  execution: ExecutionAdmissionRow
  assignment: RelationalAssignmentRecordV1
  attemptIdentity: RunAttemptIdentityBinding
}

const respondentTypeFor = (assignment: RelationalAssignmentRecordV1): RespondentTypeV1 | null => {
  if (assignment.respondentRole === 'PARENT') return 'PARENT'
  if (assignment.respondentRole === 'TEACHER') return 'TEACHER'
  if (assignment.relationshipKind === 'SELF') return 'SELF'
  return null
}

const parseAdmittedAttemptIdentity = (value: unknown): RunAttemptIdentityBinding => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RunStartAdmissionError('RUN_START_IDENTITY_MISSING', 'admitted START has no frozen attempt identity', 500)
  }
  const row = value as Record<string, unknown>
  const respondentType = row.respondentType
  if (
    typeof row.subjectUserId !== 'string'
    || typeof row.respondentUserId !== 'string'
    || typeof row.episodeId !== 'string'
    || typeof row.assignmentRef !== 'string'
    || !(row.consentId === null || typeof row.consentId === 'string')
    || !(respondentType === null || respondentType === 'SELF' || respondentType === 'PARENT' || respondentType === 'TEACHER')
  ) {
    throw new RunStartAdmissionError('RUN_START_IDENTITY_INVALID', 'admitted START attempt identity is invalid', 500)
  }
  return {
    subjectUserId: row.subjectUserId,
    respondentUserId: row.respondentUserId,
    respondentType,
    episodeId: row.episodeId,
    assignmentRef: row.assignmentRef,
    consentId: row.consentId,
  }
}

const readAdmittedAttemptIdentity = async (db: Tx, executionId: string): Promise<RunAttemptIdentityBinding> => {
  const rows = await db.$queryRaw<Array<{ attemptIdentity: unknown }>>`
    SELECT "admitted_attempt_identity" AS "attemptIdentity"
    FROM "assessment_run_execution_start_claims"
    WHERE "execution_id" = ${executionId}
    LIMIT 1
  `
  return parseAdmittedAttemptIdentity(rows[0]?.attemptIdentity)
}

const assertFrozenIdentityMatchesAssignment = (
  frozen: RunAttemptIdentityBinding,
  assignment: RelationalAssignmentRecordV1,
): void => {
  if (
    frozen.subjectUserId !== assignment.subjectUserId
    || frozen.respondentUserId !== assignment.respondentUserId
    || frozen.respondentType !== respondentTypeFor(assignment)
    || frozen.episodeId !== assignment.episodeId
    || frozen.assignmentRef !== assignment.assignmentId
  ) {
    throw new RunStartAdmissionError('RUN_START_IDENTITY_MISMATCH', 'frozen START identity no longer matches its assignment', 500)
  }
}

export const buildRunAttemptIdentity = async (
  assignment: RelationalAssignmentRecordV1,
  assignments: Pick<RelationalAssignmentRepository, 'resolveAcceptedConsent'>,
): Promise<RunAttemptIdentityBinding> => {
  const resolved = assignment.consentId
    ? await assignments.resolveAcceptedConsent(assignment)
    : null
  if (assignment.consentId && !resolved) {
    throw new RunStartAdmissionError('RUN_CONSENT_REQUIRED', 'current accepted consent is required before Run START', 409)
  }
  return {
    subjectUserId: assignment.subjectUserId,
    respondentUserId: assignment.respondentUserId,
    respondentType: respondentTypeFor(assignment),
    episodeId: assignment.episodeId,
    assignmentRef: assignment.assignmentId,
    consentId: resolved?.consentId ?? null,
  }
}

export const loadRunExecutionStartAdmission = async (input: {
  tx?: Tx
  executionId: string
  actorUserId: string
  admitted?: boolean
  assignments?: Pick<RelationalAssignmentRepository, 'findById' | 'resolveAcceptedConsent'>
}): Promise<RunStartAdmission> => {
  const db = input.tx ?? (prisma as unknown as Tx)
  const rows = await db.$queryRaw<ExecutionAdmissionRow[]>`
    SELECT e."id" AS "executionId", e."organization_id" AS "organizationId", e."run_id" AS "runId",
      e."track_id" AS "trackId", e."status" AS "executionStatus", r."status" AS "runStatus",
      e."relational_assignment_id" AS "relationalAssignmentId", ra."policy_domain" AS "policyDomain",
      respondent."user_id" AS "respondentUserId", e."runtime_binding_kind" AS "runtimeBindingKind",
      e."runtime_binding_ref" AS "runtimeBindingRef"
    FROM "assessment_run_executions" e
    JOIN "assessment_runs" r
      ON r."organization_id" = e."organization_id" AND r."id" = e."run_id"
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id" = e."organization_id"
      AND respondent."run_id" = e."run_id"
      AND respondent."id" = e."respondent_actor_snapshot_id"
    LEFT JOIN "relational_assessment_assignments" ra
      ON ra."id" = e."relational_assignment_id"
    WHERE e."id" = ${input.executionId}
    LIMIT 1
  `
  const execution = rows[0]
  if (!execution) throw new RunStartAdmissionError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  if (execution.respondentUserId !== input.actorUserId) {
    throw new RunStartAdmissionError('RUN_EXECUTION_ACTOR', 'only the frozen respondent may start this Run execution', 403)
  }
  if (!input.admitted && execution.runStatus !== 'PUBLISHED') {
    throw new RunStartAdmissionError('RUN_NOT_STARTABLE', 'Run is not open for new START admission', 409)
  }
  if (!execution.relationalAssignmentId) {
    throw new RunStartAdmissionError('RUN_ASSIGNMENT_MISSING', 'Run execution has no relational assignment binding', 409)
  }
  if (execution.policyDomain !== 'ORGANIZATION_RUN') {
    throw new RunStartAdmissionError('RUN_ASSIGNMENT_DOMAIN', 'Run execution must bind an ORGANIZATION_RUN assignment', 409)
  }
  if (!['ASSIGNED', 'STARTED'].includes(execution.executionStatus)) {
    throw new RunStartAdmissionError('RUN_EXECUTION_NOT_STARTABLE', 'Run execution is not startable', 409)
  }

  const assignmentRepository = input.assignments
    ?? createSqlRelationalAssignmentRepository(db as any)
  const assignment = await assignmentRepository.findById(execution.relationalAssignmentId)
  if (!assignment) throw new RunStartAdmissionError('RUN_ASSIGNMENT_MISSING', 'Run assignment does not exist', 409)
  if (assignment.respondentUserId !== input.actorUserId) {
    throw new RunStartAdmissionError('RUN_EXECUTION_ACTOR', 'assignment respondent does not match frozen Run respondent', 403)
  }
  if (assignment.status === 'REVOKED' || assignment.status === 'EXPIRED' || assignment.status === 'COMPLETED') {
    throw new RunStartAdmissionError('RUN_ASSIGNMENT_NOT_STARTABLE', 'Run assignment is not startable', 409)
  }

  if (!assignment.consentId && (assignment.respondentRole === 'PARENT' || assignment.visibilityPolicyKey.startsWith('observer_'))) {
    throw new RunStartAdmissionError('RUN_CONSENT_REQUIRED', 'observer Run assignment requires a consent lineage; republish legacy unstarted tasks')
  }

  if (input.admitted) {
    const attemptIdentity = await readAdmittedAttemptIdentity(db, input.executionId)
    assertFrozenIdentityMatchesAssignment(attemptIdentity, assignment)
    return { execution, assignment, attemptIdentity }
  }

  const attemptIdentity = await buildRunAttemptIdentity(assignment, assignmentRepository)
  return { execution, assignment, attemptIdentity }
}
