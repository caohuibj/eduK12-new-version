import { prisma } from '../../config/database'

export type RunExecutionProgressState =
  | 'NOT_STARTED'
  | 'STARTING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNKNOWN'

export interface RunExecutionProgressProjection {
  executionId: string
  state: RunExecutionProgressState
  runtimeBindingKind: string | null
  runtimeBindingRef: string | null
}

export interface RunProgressProjection {
  runId: string
  total: number
  counts: Record<RunExecutionProgressState, number>
  executions: RunExecutionProgressProjection[]
}

export const readAssessmentRunProgress = async (runId: string): Promise<RunProgressProjection> => {
  const rows = await prisma.$queryRaw<Array<{
    executionId: string
    executionStatus: string
    runtimeBindingKind: string | null
    runtimeBindingRef: string | null
    claimState: string | null
    compositeStatus: string | null
  }>>`
    SELECT e."id" AS "executionId", e."status" AS "executionStatus",
      e."runtime_binding_kind" AS "runtimeBindingKind", e."runtime_binding_ref" AS "runtimeBindingRef",
      c."state" AS "claimState", ca."status" AS "compositeStatus"
    FROM "assessment_run_executions" e
    LEFT JOIN "assessment_run_execution_start_claims" c ON c."execution_id" = e."id"
    LEFT JOIN "composite_assessment_attempts" ca
      ON e."runtime_binding_kind" = 'COMPOSITE' AND ca."id" = e."runtime_binding_ref"
    WHERE e."run_id" = ${runId}
    ORDER BY e."created_at", e."id"
  `

  const executions = rows.map<RunExecutionProgressProjection>((row) => {
    let state: RunExecutionProgressState
    if (row.compositeStatus === 'COMPLETED' || row.executionStatus === 'COMPLETED') state = 'COMPLETED'
    else if (row.executionStatus === 'CANCELLED' || row.executionStatus === 'REVOKED') state = 'CANCELLED'
    else if (row.executionStatus === 'EXPIRED') state = 'EXPIRED'
    else if (row.claimState === 'UNKNOWN') state = 'UNKNOWN'
    else if (row.runtimeBindingRef) state = 'IN_PROGRESS'
    else if (row.claimState === 'CLAIMED' || row.claimState === 'DISPATCHED') state = 'STARTING'
    else state = 'NOT_STARTED'
    return {
      executionId: row.executionId,
      state,
      runtimeBindingKind: row.runtimeBindingKind,
      runtimeBindingRef: row.runtimeBindingRef,
    }
  })
  const counts: Record<RunExecutionProgressState, number> = {
    NOT_STARTED: 0,
    STARTING: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    EXPIRED: 0,
    UNKNOWN: 0,
  }
  for (const execution of executions) counts[execution.state] += 1
  return { runId, total: executions.length, counts, executions }
}
