import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
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
import {governedArtifactMetrics,narrowGovernedProjection} from './governedDisclosure'
import { reportingFail, type ReportingArtifactRecord, type ReportingCohortSelectorInputV2, type ReportingGroupArtifactRecord, type ReportingLeafSourceV2, type ReportingCohortSnapshotRecord, type ReportingGroupArtifactPayload } from './types'

const publicArtifact = async (artifact: ReportingArtifactRecord, principal: ReportingPrincipal) => {
  await assertFixedPopulationArtifactDisclosure({ principal, artifact })
  const allowed=artifact.analysisKind==='GROUP'&&artifact.artifactPayload.schemaVersion===2
    ?await governedArtifactMetrics({principal,artifact}):null
  return {
    artifactId: artifact.id,
    generatedAt: artifact.generatedAt.toISOString(),
    projection: narrowGovernedProjection(artifact.artifactPayload.projection,allowed),
  }
}

export const generateOrganizationGroupAnalysis = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
  trackId: string
  specId: string
  cohortSelector?: ReportingCohortSelectorInputV2
  leaf?: ReportingLeafSourceV2
  presentation?: { sourceLabel: string; populationLabel: string }
  beforeCompute?: (cohort: ReportingCohortSnapshotRecord) => Promise<void>
  beforePersist?: (input:{cohort:ReportingCohortSnapshotRecord;payload:ReportingGroupArtifactPayload}) => Promise<void>
  tx?: Prisma.TransactionClient
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
  await input.beforeCompute?.(cohort)
  const batch = await resolveAuthoritativeRunResults(cohort, input.leaf)
  const generatedAt = new Date()
  const built = buildReportingArtifact({
    artifactId: randomUUID(),
    generatedByUserId: input.principal.userId,
    generatedAt: generatedAt.toISOString(),
    spec,
    cohort,
    batch,
    options: {},
    leaf: input.leaf,
    presentation: input.presentation,
  })
  await input.beforePersist?.({cohort,payload:built.payload})
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
  }, input.tx)
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
