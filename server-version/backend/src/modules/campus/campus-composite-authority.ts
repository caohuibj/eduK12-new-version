import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'

export async function checkCampusCompositeAccessAuthority(input: {
  attemptId: string
  userId: string
}): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT e."id" FROM "assessment_run_executions" e
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."id"=e."respondent_actor_snapshot_id"
      AND respondent."organization_id"=e."organization_id"
      AND respondent."run_id"=e."run_id"
    JOIN "campus_activity_runs" ca ON ca."run_id"=e."run_id"
      AND ca."organization_id"=e."organization_id"
    WHERE e."runtime_binding_kind"='COMPOSITE'
      AND e."runtime_binding_ref"=${input.attemptId}
      AND respondent."user_id"=${input.userId}
      AND ${currentRunPopulationAuthoritySql(Prisma.sql`e."id"`)}
    LIMIT 1
  `)
  return rows.length > 0
}
