import { prisma } from '../../config/database'
import { reconcileRunExecutionByRuntimeBinding } from '../assessment-run/reconcile'

/** Project authoritative completion into the owning assignment domain. */
export async function reconcileRelationalCompositeCompletion(attemptId: string): Promise<void> {
  const run = await reconcileRunExecutionByRuntimeBinding({ runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: attemptId })
  if (run) return
  // Legacy assignments have no Run execution. Require the entire frozen actor
  // and episode binding; never route an Organization assignment through here.
  await prisma.$executeRaw`
    UPDATE "relational_assessment_assignments" a
    SET "status" = 'COMPLETED', "completed_at" = c."completed_at", "updated_at" = statement_timestamp()
    FROM "composite_assessment_attempts" c
    WHERE c."id" = ${attemptId} AND c."status" = 'COMPLETED' AND c."completed_at" IS NOT NULL
      AND a."id" = c."assignment_ref" AND a."policy_domain" = 'LEGACY_COURSE' AND a."status" = 'STARTED'
      AND a."subject_user_id" = c."subject_user_id" AND a."respondent_user_id" = c."respondent_user_id"
      AND a."respondent_user_id" = c."user_id" AND a."episode_id" = c."episode_id"
  `
}
