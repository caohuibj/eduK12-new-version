import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertOrganizationGroupSubgroupSubjectsAccess, type ReportingPrincipal } from './authorization'
import { reportingFail, type ReportingCohortSnapshotRecord } from './types'

type PrivacyEntry = {
  cohort: ReportingCohortSnapshotRecord
  minimumN: number
}

type PopulationRow = { runId: string; trackId: string; n: number }
type PriorRow = {
  sourceRunId: string
  sourceTrackId: string
  members: Array<{ userId: string }>
  generatedAt: Date
}

const sourceKey = (runId: string, trackId: string) => `${runId}\u0000${trackId}`
const privacyFail = (): never =>
  reportingFail('REPORT_PRIVACY_GUARD', 'selected subgroup is too identifying for a new aggregate report', 409)

const isFiltered = (cohort: ReportingCohortSnapshotRecord) =>
  cohort.selector.kind === 'FILTERED_RUN_TRACK_SUBJECTS' && cohort.selector.clauses.length > 0

const hasMemberSelection = (cohort: ReportingCohortSnapshotRecord) =>
  cohort.selector.kind === 'FILTERED_RUN_TRACK_SUBJECTS'
  && cohort.selector.clauses.some((clause) => clause.kind === 'MEMBERSHIP_IDS')

export const assertReportingSubgroupsPrivacy = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  specId: string
  entries: PrivacyEntry[]
}): Promise<void> => {
  const entries = input.entries.filter((entry) => isFiltered(entry.cohort))
  if (!entries.length) return

  const subjectUserIds = [...new Set(entries.flatMap((entry) => entry.cohort.members.map((member) => member.userId)))]
  const { organizationManager } = await assertOrganizationGroupSubgroupSubjectsAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    subjectUserIds,
  })
  // Organization managers retain the existing trusted aggregate workflow.
  if (organizationManager) return

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

  const memberEntries = entries.filter((entry) => hasMemberSelection(entry.cohort))
  if (!memberEntries.length) return
  const priorRows = await prisma.$queryRaw<PriorRow[]>(Prisma.sql`
    SELECT exposed."sourceRunId", exposed."sourceTrackId", exposed.members, exposed."generatedAt"
    FROM (
      SELECT cohort."source_run_id" AS "sourceRunId", cohort."source_track_id" AS "sourceTrackId",
        cohort.members, artifact."generated_at" AS "generatedAt"
      FROM "reporting_analysis_artifacts" artifact
      JOIN "reporting_cohort_snapshots" cohort
        ON cohort."organization_id"=artifact."organization_id"
       AND cohort."id"=artifact."cohort_snapshot_id"
      WHERE artifact."organization_id"=${input.organizationId}
        AND artifact."spec_id"=${input.specId}
        AND artifact."analysis_kind"='GROUP'
        AND (${Prisma.join(memberEntries.map((entry) => Prisma.sql`(
          cohort."source_run_id"=${entry.cohort.sourceRunId}
          AND cohort."source_track_id"=${entry.cohort.sourceTrackId}
        )`), ' OR ')})
        AND cohort.selector->>'kind'='FILTERED_RUN_TRACK_SUBJECTS'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(cohort.selector->'clauses') clause
          WHERE clause->>'kind'='MEMBERSHIP_IDS'
        )
      UNION ALL
      SELECT cohort."source_run_id" AS "sourceRunId", cohort."source_track_id" AS "sourceTrackId",
        cohort.members, artifact."generated_at" AS "generatedAt"
      FROM "reporting_analysis_artifacts" artifact
      JOIN "reporting_analysis_artifact_waves" binding
        ON binding."organization_id"=artifact."organization_id"
       AND binding."artifact_id"=artifact."id"
      JOIN "reporting_series_waves" wave
        ON wave."organization_id"=binding."organization_id"
       AND wave."series_id"=binding."series_id"
       AND wave."id"=binding."wave_id"
      JOIN "reporting_cohort_snapshots" cohort
        ON cohort."organization_id"=wave."organization_id"
       AND cohort."id"=wave."cohort_snapshot_id"
      WHERE artifact."organization_id"=${input.organizationId}
        AND artifact."spec_id"=${input.specId}
        AND artifact."analysis_kind" IN ('REPEATED_COHORT','MATCHED_LONGITUDINAL')
        AND (${Prisma.join(memberEntries.map((entry) => Prisma.sql`(
          cohort."source_run_id"=${entry.cohort.sourceRunId}
          AND cohort."source_track_id"=${entry.cohort.sourceTrackId}
        )`), ' OR ')})
        AND cohort.selector->>'kind'='FILTERED_RUN_TRACK_SUBJECTS'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(cohort.selector->'clauses') clause
          WHERE clause->>'kind'='MEMBERSHIP_IDS'
        )
    ) exposed
    ORDER BY exposed."generatedAt" DESC
    LIMIT 501
  `)
  if (priorRows.length > 500) privacyFail()

  const priorBySource = new Map<string, PriorRow[]>()
  for (const row of priorRows) {
    const key = sourceKey(row.sourceRunId, row.sourceTrackId)
    const current = priorBySource.get(key) ?? []
    current.push(row)
    priorBySource.set(key, current)
  }

  for (const entry of memberEntries) {
    const floor = Math.max(3, entry.minimumN)
    const current = new Set(entry.cohort.members.map((member) => member.userId))
    for (const prior of priorBySource.get(sourceKey(entry.cohort.sourceRunId, entry.cohort.sourceTrackId)) ?? []) {
      const previous = new Set(prior.members.map((member) => member.userId))
      let currentOnly = 0
      let previousOnly = 0
      for (const userId of current) if (!previous.has(userId)) currentOnly += 1
      for (const userId of previous) if (!current.has(userId)) previousOnly += 1
      if (
        (currentOnly > 0 && currentOnly < floor)
        || (previousOnly > 0 && previousOnly < floor)
      ) privacyFail()
    }
  }
}
