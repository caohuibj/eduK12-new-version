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
import { reportingFail, type ReportingArtifactRecord } from './types'

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

  // Calculation reuse never carries authorization. Recheck immediately before
  // persistence and again before returning the projection.
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

export const readOrganizationGroupArtifact = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  artifactId: string
}): Promise<ReturnType<typeof publicArtifact>> => {
  const artifact = await readReportingArtifactRecord(input.artifactId)
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
