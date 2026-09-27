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
import { assertFixedPopulationArtifactDisclosure } from './fixedPopulationPrivacy'
import { resolveAuthoritativeRunResults } from './resultSource'
import { getPublishedReportingSpec } from './spec'
import { assertReportingSubgroupsPrivacy } from './subgroupPrivacy'
import { reportingFail, type ReportingArtifactRecord, type ReportingCohortSelectorInputV2, type ReportingGroupArtifactRecord } from './types'

const publicArtifact = async (artifact: ReportingArtifactRecord, principal: ReportingPrincipal) => {
  await assertFixedPopulationArtifactDisclosure({ principal, artifact })
  return {
    artifactId: artifact.id,
    generatedAt: artifact.generatedAt.toISOString(),
    projection: artifact.artifactPayload.projection,
  }
}

export const generateOrganizationGroupAnalysis = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
  trackId: string
  specId: string
  cohortSelector?: ReportingCohortSelectorInputV2
}): Promise<Awaited<ReturnType<typeof publicArtifact>>> => {
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
  // Reject untrusted arbitrary subgroup requests before canonical payload work.
  await assertReportingSubgroupsPrivacy({
    principal: input.principal,
    organizationId: input.organizationId,
    specId: spec.id,
    entries: [{ cohort, minimumN: 3 }],
  })
  const batch = await resolveAuthoritativeRunResults(cohort)
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
  await assertFixedPopulationArtifactDisclosure({
    principal: input.principal,
    artifact: {
      organizationId: input.organizationId,
      analysisKind: 'GROUP',
      cohortSnapshotId: cohort.id,
      artifactPayload: built.payload,
    },
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
  // A former manager cannot receive an unrestricted projection after losing
  // trusted authority during generation. Reuse follows this same boundary.
  return publicArtifact(artifact, input.principal)
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
}): Promise<Awaited<ReturnType<typeof publicArtifact>>> => {
  const artifact = requireGroupArtifact(await readReportingArtifactRecord(input.artifactId))
  if (artifact.organizationId !== input.organizationId) {
    reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)
  }
  await hideUnauthorizedArtifact(() => assertOrganizationGroupArtifactReadAccess({
    principal: input.principal,
    organizationId: artifact.organizationId,
    runId: artifact.artifactPayload.source.runId,
  }))
  return publicArtifact(artifact, input.principal)
}
