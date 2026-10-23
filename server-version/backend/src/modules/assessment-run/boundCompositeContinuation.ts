import { Prisma } from '@prisma/client'

/** Exact durable binding, not a pending START claim or another attempt by the same user.
 * Callers retain their own product, lifecycle and current-authority gates.
 * executionId is a static SQL expression, never user-provided SQL.
 */
export const boundCompositeContinuationSql = (executionId: Prisma.Sql, userId: string): Prisma.Sql => Prisma.sql`
 EXISTS (
  SELECT 1 FROM "assessment_run_executions" bound_execution
  JOIN "assessment_run_tracks" bound_track
    ON bound_track."organization_id"=bound_execution."organization_id"
    AND bound_track."run_id"=bound_execution."run_id" AND bound_track."id"=bound_execution."track_id"
  JOIN "assessment_run_actor_snapshots" bound_subject
    ON bound_subject."organization_id"=bound_execution."organization_id"
    AND bound_subject."run_id"=bound_execution."run_id"
    AND bound_subject."id"=bound_execution."subject_actor_snapshot_id"
  JOIN "assessment_run_actor_snapshots" bound_respondent
    ON bound_respondent."organization_id"=bound_execution."organization_id"
    AND bound_respondent."run_id"=bound_execution."run_id"
    AND bound_respondent."id"=bound_execution."respondent_actor_snapshot_id"
    AND bound_respondent."user_id"=${userId}
  JOIN "relational_assessment_assignments" bound_assignment
    ON bound_assignment."id"=bound_execution."relational_assignment_id"
    AND bound_assignment."status"='STARTED' AND bound_assignment."policy_domain"='ORGANIZATION_RUN'
    AND bound_assignment."respondent_user_id"=${userId}
    AND bound_assignment."subject_user_id"=bound_subject."user_id"
    AND bound_assignment."resource_kind"=bound_track."resource_family"
    AND bound_assignment."resource_key"=bound_track."resource_key"
    AND bound_assignment."resource_version"=bound_track."resource_version"
  JOIN "composite_assessment_attempts" bound_attempt
    ON bound_attempt."id"=bound_execution."runtime_binding_ref"
    AND bound_attempt."assignment_ref"=bound_assignment."id"
    AND bound_attempt."user_id"=${userId} AND bound_attempt."respondent_user_id"=${userId}
    AND bound_attempt."subject_user_id"=bound_assignment."subject_user_id"
    AND bound_attempt."episode_id"=bound_assignment."episode_id"
    AND bound_attempt."status"='IN_PROGRESS'
    AND bound_attempt."composite_assessment_id"=bound_track."frozen_resource_policy"->'runtimeLaunchTarget'->>'ref'
  WHERE bound_execution."id"=${executionId} AND bound_execution."status"='STARTED'
    AND bound_execution."runtime_binding_kind"='COMPOSITE'
    AND bound_track."frozen_resource_policy"->'runtimeLaunchTarget'->>'kind'='COMPOSITE'
    -- Do not advertise a new continuation after its frozen observer consent
    -- is withdrawn. FINAL retains its independent full consent-contract check.
    AND ((bound_assignment."consent_id" IS NULL AND bound_attempt."consent_id" IS NULL)
      OR EXISTS (
        SELECT 1 FROM "assessment_attempt_consents" issued
        JOIN "assessment_attempt_consents" accepted ON accepted."id"=bound_attempt."consent_id"
          AND accepted."accepted_at" IS NOT NULL AND accepted."revoked_at" IS NULL
          AND accepted."subject_user_id"=issued."subject_user_id"
          AND accepted."respondent_user_id"=issued."respondent_user_id"
          AND ((issued."accepted_at" IS NOT NULL AND accepted."id"=issued."id")
            OR (issued."accepted_at" IS NULL AND accepted."prior_consent_id"=issued."id"))
        WHERE issued."id"=bound_assignment."consent_id" AND issued."prior_consent_id" IS NULL
          AND issued."revoked_at" IS NULL
          AND issued."subject_user_id"=bound_assignment."subject_user_id"
          AND issued."respondent_user_id"=bound_assignment."respondent_user_id"
      ))
 )
`
