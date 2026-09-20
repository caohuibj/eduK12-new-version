import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { requireRole } from '../../middleware/auth'
import { UserRole } from '../../types'

const legacyRespondentAccess = requireRole(UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER)

/** Add exact assigned Run identity without widening any legacy runtime resource. */
export const runOrLegacyRespondentAccess = (kind: 'COMPOSITE' | 'COGNITIVE') => async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== UserRole.ADMIN) return legacyRespondentAccess(req, res, next)
  try {
    const runtimeRef = kind === 'COMPOSITE' ? req.params.attemptId : req.params.id
    const rows = kind === 'COMPOSITE'
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT e."id" FROM "assessment_run_executions" e
          JOIN "assessment_run_actor_snapshots" a ON a."id" = e."respondent_actor_snapshot_id"
            AND a."organization_id" = e."organization_id" AND a."run_id" = e."run_id"
          WHERE e."runtime_binding_kind" = 'COMPOSITE' AND e."runtime_binding_ref" = ${runtimeRef}
            AND a."user_id" = ${req.user.userId} LIMIT 1
        `
      : await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT e."id" FROM "assessment_run_executions" e
          JOIN "assessment_run_actor_snapshots" a ON a."id" = e."respondent_actor_snapshot_id"
            AND a."organization_id" = e."organization_id" AND a."run_id" = e."run_id"
          JOIN "cognitive_sessions" c ON c."composite_attempt_id" = e."runtime_binding_ref"
          WHERE e."runtime_binding_kind" = 'COMPOSITE' AND c."id" = ${runtimeRef}
            AND a."user_id" = ${req.user.userId} LIMIT 1
        `
    if (rows.length > 0) return next()
    return legacyRespondentAccess(req, res, next)
  } catch (err) { return next(err) }
}
