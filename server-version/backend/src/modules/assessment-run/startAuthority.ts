import { Prisma } from '@prisma/client'
import { currentWindowSql } from './currentActorAuthority'
import { currentRunPopulationAuthoritySql } from './currentPopulationAuthority'
import { RunStartAdmissionError } from './startAdmission'

/** Called with Organization SHARE -> Run SHARE -> Execution UPDATE held. */
export const assertCurrentRunStartAuthority = async (tx: Prisma.TransactionClient, executionId: string): Promise<void> => {
  const fail = (code: string) => { throw new RunStartAdmissionError(code, 'current Run START authority is no longer valid', 403) }
  // Account mutation conflicts with these shared fences. Do not evaluate expiry
  // against this statement's start time: acquiring a row lock can wait past it.
  const users = await tx.$queryRaw<Array<{ valid: boolean }>>`
    SELECT (u."is_active" AND NOT u."is_frozen" AND NOT u."must_change_password"
      AND (u."role" <> 'TEACHER' OR u."teacher_approved")) AS "valid"
    FROM "users" u
    WHERE u."id" IN (
      SELECT a."user_id" FROM "assessment_run_actor_snapshots" a
      JOIN "assessment_run_executions" e ON a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
      WHERE e."id" = ${executionId}
    ) ORDER BY u."id" FOR SHARE OF u
  `
  if (!users.length || users.some((u) => !u.valid)) fail('RUN_ACCOUNT_INACTIVE')
  const envelopes = await tx.$queryRaw<Array<{ organizationId: string; active: boolean }>>`
    SELECT e."organization_id" AS "organizationId", o."status" = 'ACTIVE' AS "active"
    FROM "assessment_run_executions" e JOIN "assessment_runs" r ON r."id" = e."run_id"
    JOIN "organizations" o ON o."id" = e."organization_id" WHERE e."id" = ${executionId}
  `
  const envelope = envelopes[0]
  if (!envelope?.active) fail('ORGANIZATION_SUSPENDED')
  const actors = await tx.$queryRaw<Array<{ valid: boolean; denied: boolean }>>`
    SELECT (a."provenance_kind" = 'EXTERNAL_PARENT' OR EXISTS (
      SELECT 1 FROM "organization_memberships" m
      JOIN "organization_persona_grants" pg ON pg."membership_id" = m."id" AND pg."organization_id" = m."organization_id"
      WHERE m."id" = a."membership_id" AND m."user_id" = a."user_id" AND m."organization_id" = a."organization_id"
        AND m."valid_from" <= statement_timestamp() AND ${currentWindowSql(Prisma.sql`m`)}
        AND pg."id" = a."snapshot_payload"->>'personaGrantId' AND pg."persona" = a."actor_role" AND pg."revoked_at" IS NULL
    )) AS "valid", EXISTS (
      SELECT 1 FROM "organization_access_denies" d WHERE d."organization_id" = a."organization_id"
        AND d."user_id" = a."user_id" AND d."lifted_at" IS NULL AND d."permission" IN ('*', 'RUN_START')
    ) AS "denied"
    FROM "assessment_run_actor_snapshots" a JOIN "assessment_run_executions" e
      ON a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
    WHERE e."id" = ${executionId}
  `
  if (actors.some((a) => !a.valid || a.denied)) fail('RUN_ACTOR_AUTHORITY_REVOKED')
  const externalParents = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT DISTINCT a."user_id" AS "userId"
    FROM "assessment_run_actor_snapshots" a
    JOIN "assessment_run_executions" e
      ON a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
    WHERE e."id" = ${executionId} AND a."provenance_kind" = 'EXTERNAL_PARENT'
  `
  for (const parent of externalParents) {
    const tether = await tx.$queryRaw<Array<{ valid: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM "parent_student_relationships" r
        JOIN "organization_memberships" m
          ON m."organization_id" = ${envelope.organizationId}
          AND m."user_id" = r."student_user_id"
          AND ${currentWindowSql(Prisma.sql`m`)}
        JOIN "organization_persona_grants" pg
          ON pg."organization_id" = m."organization_id"
          AND pg."membership_id" = m."id"
          AND pg."persona" = 'STUDENT'
          AND pg."revoked_at" IS NULL
        WHERE r."parent_user_id" = ${parent.userId}
          AND r."status" = 'ACTIVE'
          AND r."approved_at" IS NOT NULL
      ) AS "valid"
    `
    if (!tether[0]?.valid) fail('RUN_PARENT_ORGANIZATION_TETHER_REVOKED')
  }
  const relationships = await tx.$queryRaw<Array<{ kind: string; ref: string | null; facts: Record<string, string> }>>`
    SELECT s."relationship_kind" AS "kind", s."relationship_ref" AS "ref", s."snapshot_payload"->'facts' AS "facts"
    FROM "assessment_run_relationship_snapshots" s JOIN "assessment_run_executions" e ON e."relationship_snapshot_id" = s."id"
    WHERE e."id" = ${executionId}
  `
  const relationship = relationships[0]
  if (!relationship) fail('RUN_RELATIONSHIP_REVOKED')
  let valid = relationship.kind === 'SELF'
  if (relationship.kind === 'PARENT_CHILD') {
    const rows = await tx.$queryRaw<Array<{ valid: boolean }>>`
      SELECT ("status" = 'ACTIVE' AND "approved_at" IS NOT NULL) AS "valid"
      FROM "parent_student_relationships" WHERE "id" = ${relationship.ref} FOR SHARE
    `
    valid = rows[0]?.valid ?? false
  } else if(relationship.kind==='STUDENT_PEER'){
    const peers=await tx.$queryRaw<Array<{id:string}>>`
      SELECT peer."id" FROM "campus_peer_assignments" peer
      JOIN "campus_peer_consents" subject_consent
        ON subject_consent."course_id"=peer."course_id"
        AND subject_consent."organization_id"=peer."organization_id"
        AND subject_consent."membership_id"=peer."subject_membership_id"
        AND subject_consent."withdrawn_at" IS NULL
        AND subject_consent."guardian_consented_at" IS NOT NULL
        AND subject_consent."consent_version"='HUISCHOOL_PEER_V1'
      JOIN "campus_peer_consents" respondent_consent
        ON respondent_consent."course_id"=peer."course_id"
        AND respondent_consent."organization_id"=peer."organization_id"
        AND respondent_consent."membership_id"=peer."respondent_membership_id"
        AND respondent_consent."withdrawn_at" IS NULL
        AND respondent_consent."guardian_consented_at" IS NOT NULL
        AND respondent_consent."consent_version"='HUISCHOOL_PEER_V1'
      JOIN "parent_student_relationships" sg
        ON sg."id"=subject_consent."guardian_relationship_id"
        AND sg."status"='ACTIVE' AND sg."approved_at" IS NOT NULL
        AND sg."revoked_at" IS NULL
      JOIN "parent_student_relationships" rg
        ON rg."id"=respondent_consent."guardian_relationship_id"
        AND rg."status"='ACTIVE' AND rg."approved_at" IS NOT NULL
        AND rg."revoked_at" IS NULL
      WHERE peer."id"=${relationship.ref}
        AND peer."organization_id"=${envelope.organizationId}
        AND peer."status"='ACTIVE'
        AND peer."id"=${relationship.facts.peerAssignmentId}
      FOR SHARE OF peer,subject_consent,respondent_consent,sg,rg
    `
    valid=peers.length===1
  } else if (relationship.kind === 'COUNSELOR_CLIENT') {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "organization_counselor_client_relationships"
      WHERE "id" = ${relationship.ref} AND "organization_id" = ${envelope.organizationId} AND "valid_from" <= statement_timestamp() AND ("valid_until" IS NULL OR "valid_until" > statement_timestamp())
      FOR SHARE
    `
    valid = Boolean(rows[0])
  } else if ((relationship.kind === 'CLASS_TEACHER_STUDENT' || relationship.kind === 'COURSE_TEACHER_STUDENT')) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT sc."id" FROM "organization_student_class_assignments" sc
      JOIN "organization_staff_class_assignments" sa ON sa."organization_id" = sc."organization_id" AND sa."class_unit_id" = sc."class_unit_id"
      WHERE sc."id" = ${relationship.facts.studentClassAssignmentId} AND sa."id" = ${relationship.facts.staffClassAssignmentId}
        AND sc."organization_id" = ${envelope.organizationId} AND ${currentWindowSql(Prisma.sql`sc`)} AND ${currentWindowSql(Prisma.sql`sa`)}
      FOR SHARE OF sc, sa
    `
    valid = Boolean(rows[0])
  }
  if (valid && relationship.facts.courseId) {
    const rows = await tx.$queryRaw<Array<{ valid: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM courses c
        JOIN course_students cs ON cs.course_id = c.id AND cs.status IN ('ACTIVE', 'APPROVED')
        JOIN assessment_run_executions e ON e.id = ${executionId}
        JOIN assessment_run_actor_snapshots subject ON subject.id = e.subject_actor_snapshot_id
        JOIN assessment_run_actor_snapshots respondent ON respondent.id = e.respondent_actor_snapshot_id
        WHERE c.id = ${relationship.facts.courseId} AND c.status = 'PUBLISHED' AND c.ended_at IS NULL
          AND c.creator_id = CASE WHEN subject.actor_role = 'TEACHER' THEN subject.user_id ELSE respondent.user_id END
          AND cs.student_id = CASE WHEN subject.actor_role = 'STUDENT' THEN subject.user_id ELSE respondent.user_id END) AS valid
    `
    valid = rows[0]?.valid === true
  }
  if (!valid) fail('RUN_RELATIONSHIP_REVOKED')

  // A separate statement is essential here: statement_timestamp() is fixed at
  // the beginning of its statement, not the end of a lock wait. All authority
  // fences are now held; this is the time-window admission decision.
  const windows = await tx.$queryRaw<Array<{ intakeOpen: boolean; accountsCurrent: boolean; populationCurrent: boolean }>>`
    SELECT ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`)} AS "populationCurrent", (r."intake_deadline" IS NULL OR r."intake_deadline" > statement_timestamp()) AS "intakeOpen",
      NOT EXISTS (
        SELECT 1 FROM "assessment_run_actor_snapshots" a JOIN "users" u ON u."id"=a."user_id"
        WHERE a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
          AND u."expires_at" IS NOT NULL AND u."expires_at" <= statement_timestamp()
      ) AS "accountsCurrent"
    FROM "assessment_run_executions" e JOIN "assessment_runs" r ON r."id"=e."run_id"
    WHERE e."id"=${executionId}
  `
  if (!windows[0]?.accountsCurrent) fail('RUN_ACCOUNT_INACTIVE')
  if (!windows[0]?.populationCurrent) fail('RUN_ACTOR_AUTHORITY_REVOKED')
  if (!windows[0].intakeOpen) fail('RUN_INTAKE_CLOSED')
}
