import { randomUUID } from 'node:crypto'
import {
  assertOrganizationGroupArtifactReadAccess,
  assertOrganizationGroupReportGenerateAccess,
  hideUnauthorizedArtifact,
  type ReportingPrincipal,
} from './authorization'
import { createOrReuseReportingArtifact, readReportingArtifactRecord } from './artifact'
import { freezeRunTrackCohort } from './cohort'
import { buildReportingArtifact } from './engine'
import { resolveAuthoritativeRunResults } from './resultSource'
import { getPublishedReportingSpec } from './spec'
import { assertReportingSubgroupsPrivacy } from './subgroupPrivacy'
import { reportingFail, type ReportingArtifactRecord, type ReportingCohortSelectorInputV2, type ReportingGroupArtifactRecord } from './types'

const publicArtifact = (artifact: ReportingArtifactRecord) => ({
  artifactId: artifact.id,
  generatedAt: artifact.generatedAt.toISOString(),
  projection: artifact.artifactPayload.projection,
})

export const generateOrganizationGroupAnalysis = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
  trackId: string
  specId: string
  cohortSelector?: ReportingCohortSelectorInputV2
}): Promise<ReturnType<typeof publicArtifact>> => {
  await assertOrganizationGroupReportGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runId: input.runId,
  })
  const spec = await getPublishedReportingSpec(input.specId)
  const cohort = await freezeRunTrackCohort({
    organizationId: input.organizationId,
    runId: input.runId,
    trackId: input.trackId,
    generatedByUserId: input.principal.userId,
    cohortSelector: input.cohortSelector,
  })
  const batch = await resolveAuthoritativeRunResults(cohort)
  if (cohort.selector.kind === 'FILTERED_RUN_TRACK_SUBJECTS' && cohort.selector.clauses.length > 0) {
    const definition = spec.definition
    const minimumN = Math.max(
      3,
      'minimumCohortN' in definition ? definition.minimumCohortN : 3,
      'minimumContributorN' in definition ? definition.minimumContributorN : 3,
      batch.resourceMinimumN ?? 0,
    )
    await assertReportingSubgroupsPrivacy({
      principal: input.principal,
      organizationId: input.organizationId,
      specId: spec.id,
      entries: [{ cohort, minimumN }],
    })
  }
  const generatedAt = new Date()
  const built = buildReportingArtifact({
    artifactId: randomUUID(),
    generatedByUserId: input.principal.userId,
    generatedAt: generatedAt.toISOString(),
    spec,
    cohort,
    batch,
    options: {},
  })

  await assertOrganizationGroupReportGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runId: input.runId,
  })
  const artifact = await createOrReuseReportingArtifact({
    organizationId: input.organizationId,
    cohortSnapshotId: cohort.id,
    specId: spec.id,
    analysisIdentityHash: built.analysisIdentityHash,
    artifactPayload: built.payload,
    snapshotHash: built.snapshotHash,
    generatedByUserId: input.principal.userId,
    generatedAt,
  })
  await assertOrganizationGroupReportGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runId: input.runId,
  })
  return publicArtifact(artifact)
}

const requireGroupArtifact = (artifact: ReportingArtifactRecord): ReportingGroupArtifactRecord => {
  if (artifact.analysisKind !== 'GROUP' || artifact.policyDomain !== 'ORG_GROUP_REPORT_V1') {
    return reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)
  }
  return artifact
}

export const readOrganizationGroupArtifact = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  artifactId: string
}): Promise<ReturnType<typeof publicArtifact>> => {
  const artifact = requireGroupArtifact(await readReportingArtifactRecord(input.artifactId))
  if (artifact.organizationId !== input.organizationId) {
    reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)
  }
  await hideUnauthorizedArtifact(() => assertOrganizationGroupArtifactReadAccess({
    principal: input.principal,
    organizationId: artifact.organizationId,
    runId: artifact.artifactPayload.source.runId,
  }))
  return publicArtifact(artifact)
}
