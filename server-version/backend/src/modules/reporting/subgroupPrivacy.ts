import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertOrganizationGroupSubgroupSubjectsAccess, type ReportingPrincipal } from './authorization'
import { reportingFail, type ReportingCohortSnapshotRecord } from './types'

type PrivacyEntry = {
  cohort: ReportingCohortSnapshotRecord
  minimumN: number
}

type PopulationRow = { runId: string; trackId: string; n: number }
const sourceKey = (runId: string, trackId: string) => `${runId}\u0000${trackId}`
const privacyFail = (): never =>
  reportingFail('REPORT_PRIVACY_GUARD', 'selected subgroup is too identifying for a new aggregate report', 409)

const isFiltered = (cohort: ReportingCohortSnapshotRecord) =>
  cohort.selector.kind === 'FILTERED_RUN_TRACK_SUBJECTS' && cohort.selector.clauses.length > 0

export const assertReportingSubgroupsPrivacy = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  specId: string
  entries: PrivacyEntry[]
}): Promise<{ organizationManager: boolean }> => {
  const entries = input.entries.filter((entry) => isFiltered(entry.cohort))
  if (!entries.length) return { organizationManager: false }

  const subjectUserIds = [...new Set(entries.flatMap((entry) => entry.cohort.members.map((member) => member.userId)))]
  const { organizationManager } = await assertOrganizationGroupSubgroupSubjectsAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    subjectUserIds,
  })
  // Organization managers retain the existing trusted aggregate workflow.
  if (organizationManager) return { organizationManager: true }

  const uniqueEntries = [...new Map(entries.map((entry) => [
    sourceKey(entry.cohort.sourceRunId, entry.cohort.sourceTrackId),
    entry,
  ])).values()]
  const populationRows = await prisma.$queryRaw<PopulationRow[]>(Prisma.sql`
    SELECT execution."run_id" AS "runId", execution."track_id" AS "trackId", COUNT(*)::int AS n
    FROM "assessment_run_executions" execution
    WHERE execution."organization_id"=${input.organizationId}
      AND (${Prisma.join(uniqueEntries.map((entry) => Prisma.sql`(
        execution."run_id"=${entry.cohort.sourceRunId}
        AND execution."track_id"=${entry.cohort.sourceTrackId}
      )`), ' OR ')})
    GROUP BY execution."run_id", execution."track_id"
  `)
  const populations = new Map(populationRows.map((row) => [sourceKey(row.runId, row.trackId), row.n]))
  for (const entry of entries) {
    const floor = Math.max(3, entry.minimumN)
    const populationN = populations.get(sourceKey(entry.cohort.sourceRunId, entry.cohort.sourceTrackId))
      ?? privacyFail()
    const selectedN = entry.cohort.members.length
    const complementN = populationN - selectedN
    if (selectedN < floor || complementN < 0 || (complementN > 0 && complementN < floor)) privacyFail()
  }

  return { organizationManager: false }

}
