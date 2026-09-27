import { assertOrganizationGroupSubgroupSubjectsAccess, type ReportingPrincipal } from './authorization'
import { fixedPopulationPrivacyFailure } from './fixedPopulationPrivacy'
import type { ReportingCohortSnapshotRecord } from './types'

type PrivacyEntry = { cohort: ReportingCohortSnapshotRecord; minimumN: number }

export const assertReportingSubgroupsPrivacy = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  specId: string
  entries: PrivacyEntry[]
}): Promise<{ organizationManager: boolean }> => {
  const entries = input.entries.filter(({ cohort }) => (
    cohort.selector.kind === 'FILTERED_RUN_TRACK_SUBJECTS'
    && (cohort.selector.clauses.length > 0 || Boolean(cohort.selector.baseline))
  ))
  if (!entries.length) return { organizationManager: false }
  const subjectUserIds = [...new Set(entries.flatMap(({ cohort }) => cohort.members.map((member) => member.userId)))]
  const result = await assertOrganizationGroupSubgroupSubjectsAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    subjectUserIds,
  })
  if (!result.organizationManager) fixedPopulationPrivacyFailure()
  // The engine still applies each resource/spec's privacy floors. This only
  // selects the trusted workflow; neither legacy role nor spec/selector names
  // can confer that authority. Historical bytes remain immutable, while all
  // reads/downloads use the same current fixed-population disclosure policy.
  return result
}
