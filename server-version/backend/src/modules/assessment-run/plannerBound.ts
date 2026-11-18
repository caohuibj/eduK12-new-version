import { Prisma } from '@prisma/client'

export type PlannerBoundReadDb = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]) => Promise<T>
  $executeRaw?: (query: TemplateStringsArray | Prisma.Sql, ...values: any[]) => Promise<unknown>
  $transaction?: <T>(fn: (tx: any) => Promise<T>) => Promise<T>
}

/**
 * Bound PostgreSQL's planner search space and prevent generic-plan caching on
 * wide current-authority task and execution reads so nested EXISTS gates
 * (`currentRunPopulationAuthoritySql`, `boundCompositeContinuationSql`,
 * `completedSchoolOrdinaryFeedbackSql`) stay correlated index subplans instead
 * of triggering semi-join pull-up / GEQO ~97 MiB per-backend MemoryContext
 * bloat or pinning ~2 MiB `CachedPlan` allocations in `CacheMemoryContext`
 * after repeated prepared-statement executions.
 *
 * Callers MUST order outer FROM/JOIN clauses from selective actor/execution
 * indexes outward. Falls back directly to `db` when unit tests supply a bare
 * `{ $queryRaw }` mock without `$transaction`.
 */
export async function withBoundedPlannerRead<T>(
  db: PlannerBoundReadDb,
  action: (client: Pick<PlannerBoundReadDb, '$queryRaw'>) => Promise<T>,
): Promise<T> {
  if (typeof db.$transaction === 'function') {
    return db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL join_collapse_limit = 1`
      await tx.$executeRaw`SET LOCAL from_collapse_limit = 1`
      await tx.$executeRaw`SET LOCAL plan_cache_mode = force_custom_plan`
      return action(tx)
    })
  }
  return action(db)
}
