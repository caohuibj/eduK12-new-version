import { governedArtifactMetrics, narrowGovernedProjection } from './governedDisclosure'
import { assertIndividualLongitudinalAccess } from './individualAuthorization'
import { prisma } from '../../config/database'
import {
  assertOrganizationGroupArtifactReadAccess,
  assertOrganizationGroupArtifactsReadAccess,
  assertOrganizationGroupReportGenerateAccess,
  assertOrganizationGroupReportsGenerateAccess,
  hideUnauthorizedArtifact,
  type ReportingPrincipal,
} from './authorization'
import { readReportingArtifactRecord } from './artifact'
import { freezeRunTrackCohort } from './cohort'
import { assertOrganizationReportingWorkspaceAccess } from './pr4Authorization'
import { createLongitudinalAnalysisArtifact, createProtectedFeedbackArtifact } from './pr4Artifact'
import { assertFixedPopulationArtifactDisclosure } from './fixedPopulationPrivacy'
import { assertProtectedFeedbackManagerAccess } from './protectedFeedback'
import { resolveAuthoritativeTrackObservations, type ReportingObservationPerspectiveV1 } from './resultSource'
import {
  bindReportingSeriesWave,
  createReportingSeries,
  readExactReportingSeriesWavesBatch,
  readReportingSeries,
  readReportingSeriesWavesByKeysBatch,
} from './series'
import { getPublishedReportingSpec } from './spec'
import {
  reportingFail,
  type ReportingAnalysisSpecRecord,
  type ReportingArtifactRecord,
  type ReportingMatchedLongitudinalSpecV1,
  type ReportingMatchedModeV1,
  type ReportingProtectedFeedbackSpecV1,
  type ReportingRepeatedCohortSpecV1,
  type ReportingResourceFamily,
  type ReportingSeriesScopeV1,
} from './types'

const publicSeries = (series: Awaited<ReturnType<typeof createReportingSeries>>) => ({
  seriesId: series.id,
  seriesKey: series.seriesKey,
  scope: series.scope,
  createdAt: series.createdAt.toISOString(),
})

const publicWave = (wave: Awaited<ReturnType<typeof bindReportingSeriesWave>>) => ({
  waveId: wave.id,
  waveKey: wave.waveKey,
  ordinal: wave.ordinal,
  source: { runId: wave.sourceRunId, trackId: wave.sourceTrackId },
  createdAt: wave.createdAt.toISOString(),
})

const publicArtifact = async (artifact: ReportingArtifactRecord, principal: ReportingPrincipal) => {
  // Every aggregate response, including an old artifact and export projection,
  // is checked with current authority. A trusted creator does not confer trusted
  // disclosure rights on an ordinary reader of the same Run.
  await assertFixedPopulationArtifactDisclosure({ principal, artifact })
  const allowedMetrics = await governedArtifactMetrics({ principal, artifact })
  if (artifact.analysisKind === 'PROTECTED_FEEDBACK') {
    return {
      artifactId: artifact.id,
      generatedAt: artifact.generatedAt.toISOString(),
      projection: narrowGovernedProjection(artifact.artifactPayload.projection, allowedMetrics),
      evidence: artifact.artifactPayload.evidence,
    }
  }
  return {
    artifactId: artifact.id,
    generatedAt: artifact.generatedAt.toISOString(),
    projection: narrowGovernedProjection(artifact.artifactPayload.projection, allowedMetrics),
  }
}

export const createOrganizationReportingSeries = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  seriesKey: string
  resourceFamily: ReportingResourceFamily
  resourceKey: string
}) => {
  await assertOrganizationReportingWorkspaceAccess({ principal: input.principal, organizationId: input.organizationId })
  const scope: ReportingSeriesScopeV1 = { schemaVersion: 1, resourceFamily: input.resourceFamily, resourceKey: input.resourceKey }
  const series = await createReportingSeries({
    organizationId: input.organizationId,
    seriesKey: input.seriesKey,
    scope,
    createdByUserId: input.principal.userId,
  })
  await assertOrganizationReportingWorkspaceAccess({ principal: input.principal, organizationId: input.organizationId })
  return publicSeries(series)
}

export const bindOrganizationReportingWave = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  seriesId: string
  waveKey: string
  ordinal: number
  runId: string
  trackId: string
}) => {
  await assertOrganizationReportingWorkspaceAccess({ principal: input.principal, organizationId: input.organizationId })
  await assertOrganizationGroupReportGenerateAccess({ principal: input.principal, organizationId: input.organizationId, runId: input.runId })
  const series = await readReportingSeries(input.seriesId)
  if (series.organizationId !== input.organizationId) reportingFail('REPORT_SERIES_NOT_FOUND', 'reporting series not found', 404)
  const cohort = await freezeRunTrackCohort({
    organizationId: input.organizationId,
    runId: input.runId,
    trackId: input.trackId,
    generatedByUserId: input.principal.userId,
  })
  await assertOrganizationGroupReportGenerateAccess({ principal: input.principal, organizationId: input.organizationId, runId: input.runId })
  const wave = await bindReportingSeriesWave({
    organizationId: input.organizationId,
    seriesId: series.id,
    waveKey: input.waveKey,
    ordinal: input.ordinal,
    cohortSnapshotId: cohort.id,
    createdByUserId: input.principal.userId,
  })
  return publicWave(wave)
}

const readAuthorizedWavesForGenerate = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  seriesId: string
  waveKeys: string[]
}) => {
  await assertOrganizationReportingWorkspaceAccess({ principal: input.principal, organizationId: input.organizationId })
  const series = await readReportingSeries(input.seriesId)
  if (series.organizationId !== input.organizationId) reportingFail('REPORT_SERIES_NOT_FOUND', 'reporting series not found', 404)
  if (new Set(input.waveKeys).size !== input.waveKeys.length || input.waveKeys.length < 2) {
    reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'longitudinal analysis requires at least two distinct Waves', 400)
  }
  const waves = await readReportingSeriesWavesByKeysBatch({
    organizationId: input.organizationId,
    seriesId: series.id,
    waveKeys: input.waveKeys,
  })
  await assertOrganizationGroupReportsGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runIds: waves.map((wave) => wave.sourceRunId),
  })
  return { series, waves }
}

export const generateOrganizationLongitudinalAnalysis = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  seriesId: string
  waveKeys: string[]
  specId: string
  analysisKind: 'REPEATED_COHORT' | 'MATCHED_LONGITUDINAL'
  mode?: ReportingMatchedModeV1
}) => {
  const { series, waves } = await readAuthorizedWavesForGenerate(input)
  const spec = await getPublishedReportingSpec(input.specId)
  if (spec.definition.analysisKind !== input.analysisKind) {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'published reporting spec does not match requested longitudinal analysis kind', 409)
  }
  await assertOrganizationGroupReportsGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runIds: waves.map((wave) => wave.sourceRunId),
  })
  const governed = spec as ReportingAnalysisSpecRecord<ReportingRepeatedCohortSpecV1 | ReportingMatchedLongitudinalSpecV1>
  const artifact = await createLongitudinalAnalysisArtifact({
    series,
    waves,
    spec: governed,
    mode: input.mode,
    generatedByUserId: input.principal.userId,
    principal: input.principal,
  })
  await assertOrganizationGroupReportsGenerateAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    runIds: waves.map((wave) => wave.sourceRunId),
  })
  return publicArtifact(artifact, input.principal)
}

type FrozenSubjectRow = { actorSnapshotId: string; userId: string }
const resolveFrozenProtectedSubject = async (input: {
  organizationId: string
  runId: string
  trackId: string
  subjectUserId: string
}): Promise<FrozenSubjectRow> => {
  const rows = await prisma.$queryRaw<FrozenSubjectRow[]>`
    SELECT DISTINCT execution."subject_actor_snapshot_id" AS "actorSnapshotId", actor."user_id" AS "userId"
    FROM "assessment_run_executions" execution
    JOIN "assessment_run_actor_snapshots" actor
      ON actor."organization_id"=execution."organization_id"
     AND actor."run_id"=execution."run_id"
     AND actor."id"=execution."subject_actor_snapshot_id"
    WHERE execution."organization_id"=${input.organizationId}
      AND execution."run_id"=${input.runId}
      AND execution."track_id"=${input.trackId}
      AND actor."user_id"=${input.subjectUserId}
  `
  if (rows.length !== 1) reportingFail('REPORT_PROTECTED_SOURCE_INVALID', 'protected subject must resolve to exactly one frozen subject actor in the source Track', 409)
  return rows[0]
}

export const generateOrganizationProtectedFeedback = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
  trackId: string
  subjectUserId: string
  relationshipKind: string
  perspective: ReportingObservationPerspectiveV1
  specId: string
}) => {
  await assertProtectedFeedbackManagerAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    subjectUserId: input.subjectUserId,
  })
  const spec = await getPublishedReportingSpec(input.specId)
  if (spec.definition.analysisKind !== 'PROTECTED_FEEDBACK') {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'published reporting spec is not protected feedback', 409)
  }
  const [batch, subject] = await Promise.all([
    resolveAuthoritativeTrackObservations({
      organizationId: input.organizationId,
      runId: input.runId,
      trackId: input.trackId,
      selection: {
        subjectUserId: input.subjectUserId,
        relationshipKind: input.relationshipKind,
        perspective: input.perspective,
      },
    }),
    resolveFrozenProtectedSubject(input),
  ])
  const all = [...batch.resolved, ...batch.unresolved]
  const allowedExecutionIds = new Set(all.map((row) => row.executionId))
  if (allowedExecutionIds.size === 0) reportingFail('REPORT_PROTECTED_SOURCE_INVALID', 'protected fixed source contains no matching executions', 409)

  await assertProtectedFeedbackManagerAccess({ principal: input.principal, organizationId: input.organizationId, subjectUserId: input.subjectUserId })
  const artifact = await createProtectedFeedbackArtifact({
    organizationId: input.organizationId,
    runId: input.runId,
    trackId: input.trackId,
    subjectActorSnapshotId: subject.actorSnapshotId,
    subjectUserId: input.subjectUserId,
    relationshipKind: input.relationshipKind,
    perspective: input.perspective,
    batch,
    allowedExecutionIds,
    spec: spec as ReportingAnalysisSpecRecord<ReportingProtectedFeedbackSpecV1>,
    generatedByUserId: input.principal.userId,
    principal: input.principal,
  })
  await assertProtectedFeedbackManagerAccess({ principal: input.principal, organizationId: input.organizationId, subjectUserId: input.subjectUserId })
  return publicArtifact(artifact, input.principal)
}

export const readOrganizationReportingArtifact = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  artifactId: string
}) => {
  const artifact = await readReportingArtifactRecord(input.artifactId)
  if (artifact.organizationId !== input.organizationId) reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)

  if (artifact.analysisKind === 'INDIVIDUAL_LONGITUDINAL') {
    await assertIndividualLongitudinalAccess({ ...input, subjectUserId: artifact.subjectUserId })
    await readExactReportingSeriesWavesBatch({
      organizationId: input.organizationId,
      seriesId: artifact.seriesId,
      bindings: artifact.artifactPayload.waveBindings,
    })
    await assertIndividualLongitudinalAccess({ ...input, subjectUserId: artifact.subjectUserId })
    return publicArtifact(artifact, input.principal)
  }

  if (artifact.analysisKind === 'GROUP') {
    await hideUnauthorizedArtifact(() => assertOrganizationGroupArtifactReadAccess({
      principal: input.principal,
      organizationId: input.organizationId,
      runId: artifact.artifactPayload.source.runId,
    }))
    return publicArtifact(artifact, input.principal)
  }

  if (artifact.analysisKind === 'REPEATED_COHORT' || artifact.analysisKind === 'MATCHED_LONGITUDINAL') {
    const waves = await readExactReportingSeriesWavesBatch({
      organizationId: input.organizationId,
      seriesId: artifact.seriesId,
      bindings: artifact.artifactPayload.waveBindings,
    })
    await hideUnauthorizedArtifact(() => assertOrganizationGroupArtifactsReadAccess({
      principal: input.principal,
      organizationId: input.organizationId,
      runIds: waves.map((wave) => wave.sourceRunId),
    }))
    return publicArtifact(artifact, input.principal)
  }

  if (artifact.analysisKind !== 'PROTECTED_FEEDBACK') {
    return reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'unsupported reporting artifact kind', 409)
  }
  await assertProtectedFeedbackManagerAccess({
    principal: input.principal,
    organizationId: input.organizationId,
    subjectUserId: artifact.artifactPayload.source.subjectUserId,
  })
  return publicArtifact(artifact, input.principal)
}
