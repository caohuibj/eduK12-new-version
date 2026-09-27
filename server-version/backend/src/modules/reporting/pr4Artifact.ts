import { randomUUID } from 'node:crypto'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  createOrReuseLongitudinalReportingArtifact,
  createOrReuseProtectedReportingArtifact,
  type ReportingPrivacyExposureV1,
} from './artifact'
import type { ReportingPrincipal } from './authorization'
import { assertFixedPopulationArtifactDisclosure } from './fixedPopulationPrivacy'
import { reportingEvidenceFor } from './engine'
import { buildMatchedLongitudinalProjection } from './matched'
import { buildSeparatedMultiRaterObservations } from './multiRater'
import { buildProtectedFeedbackProjection } from './protectedFeedback'
import { buildRepeatedCohortProjection } from './repeated'
import type { ReportingObservationBatchV1, ReportingObservationPerspectiveV1 } from './resultSource'
import {
  reportingFail,
  type ReportingAnalysisSpecRecord,
  type ReportingLongitudinalArtifactPayloadV1,
  type ReportingLongitudinalArtifactRecord,
  type ReportingLongitudinalWaveBindingV1,
  type ReportingMatchedLongitudinalSpecV1,
  type ReportingMatchedModeV1,
  type ReportingProtectedArtifactInputV1,
  type ReportingProtectedArtifactPayloadV1,
  type ReportingProtectedArtifactRecord,
  type ReportingProtectedFeedbackSpecV1,
  type ReportingRepeatedCohortSpecV1,
  type ReportingSeriesRecordV1,
  type ReportingSeriesWaveRecordV1,
} from './types'

const sortedWaves = (series: ReportingSeriesRecordV1, waves: ReportingSeriesWaveRecordV1[]): ReportingSeriesWaveRecordV1[] => {
  if (waves.length < 2) reportingFail('REPORT_LONGITUDINAL_WAVES_REQUIRED', 'longitudinal analysis requires at least two Waves', 400)
  const sorted = [...waves].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id))
  const ids = new Set<string>()
  const ordinals = new Set<number>()
  for (const wave of sorted) {
    if (wave.organizationId !== series.organizationId || wave.seriesId !== series.id) {
      reportingFail('REPORT_SERIES_SCOPE_MISMATCH', 'analysis Waves must belong to the requested Series', 409)
    }
    if (ids.has(wave.id) || ordinals.has(wave.ordinal)) reportingFail('REPORT_WAVE_CONFLICT', 'analysis contains duplicate Wave identity', 409)
    ids.add(wave.id)
    ordinals.add(wave.ordinal)
  }
  return sorted
}

const waveBindingsFor = (waves: ReportingSeriesWaveRecordV1[]): ReportingLongitudinalWaveBindingV1[] => waves.map((wave) => ({
  waveId: wave.id,
  waveKey: wave.waveKey,
  ordinal: wave.ordinal,
  cohortSnapshotId: wave.cohortSnapshotId,
  inputIdentityHash: wave.inputIdentityHash,
  snapshotHash: wave.snapshotHash,
}))

export const createLongitudinalAnalysisArtifact = async (input: {
  series: ReportingSeriesRecordV1
  waves: ReportingSeriesWaveRecordV1[]
  spec: ReportingAnalysisSpecRecord<ReportingRepeatedCohortSpecV1 | ReportingMatchedLongitudinalSpecV1>
  mode?: ReportingMatchedModeV1
  generatedByUserId: string
  generatedAt?: Date
  principal?: ReportingPrincipal
  privacyExposures?: ReportingPrivacyExposureV1[]
}): Promise<ReportingLongitudinalArtifactRecord> => {
  if (input.spec.status !== 'PUBLISHED') reportingFail('REPORT_SPEC_NOT_PUBLISHED', 'longitudinal analysis requires a published spec', 409)
  const definition = input.spec.definition
  const waves = sortedWaves(input.series, input.waves)
  if (definition.analysisKind === 'MATCHED_LONGITUDINAL' && !input.mode) {
    reportingFail('REPORT_LONGITUDINAL_MODE_REQUIRED', 'matched longitudinal analysis requires an explicit mode', 400)
  }
  if (definition.analysisKind === 'REPEATED_COHORT' && input.mode) {
    reportingFail('REPORT_LONGITUDINAL_MODE_INVALID', 'repeated cohort analysis does not accept matched mode', 400)
  }
  const projection = definition.analysisKind === 'REPEATED_COHORT'
    ? buildRepeatedCohortProjection({ waves, spec: definition })
    : buildMatchedLongitudinalProjection({ waves, spec: definition, mode: input.mode! })
  const evidence = reportingEvidenceFor(waves.flatMap((wave) => wave.inputManifest.resolved), definition.reportEvidenceCeiling)
  const waveBindings = waveBindingsFor(waves)
  const options = definition.analysisKind === 'MATCHED_LONGITUDINAL' ? { mode: input.mode! } : {}
  const analysisIdentityHash = canonicalHash({
    schema: 'ReportingPr4AnalysisIdentityV1',
    analysisKind: definition.analysisKind,
    policyDomain: 'ORG_GROUP_REPORT_V1',
    organizationId: input.series.organizationId,
    engine: { key: definition.engineKey, version: definition.engineVersion },
    series: { id: input.series.id, identityHash: input.series.seriesIdentityHash },
    spec: { id: input.spec.id, hash: input.spec.specHash, definition },
    waves: waves.map((wave) => ({
      waveId: wave.id,
      waveKey: wave.waveKey,
      ordinal: wave.ordinal,
      cohortSnapshotId: wave.cohortSnapshotId,
      inputIdentityHash: wave.inputIdentityHash,
      inputManifest: wave.inputManifest,
    })),
    options,
  })
  const generatedAt = input.generatedAt ?? new Date()
  const payload: ReportingLongitudinalArtifactPayloadV1 = {
    schemaVersion: 1,
    artifactId: randomUUID(),
    organizationId: input.series.organizationId,
    analysisKind: definition.analysisKind,
    policyDomain: 'ORG_GROUP_REPORT_V1',
    source: { kind: 'SERIES', seriesId: input.series.id, seriesIdentityHash: input.series.seriesIdentityHash },
    specId: input.spec.id,
    specHash: input.spec.specHash,
    analysisIdentityHash,
    generatedByUserId: input.generatedByUserId,
    generatedAt: generatedAt.toISOString(),
    waveBindings,
    maturityProfile: evidence.profile,
    options,
    projection,
  }
  // Evaluate the actual immutable projection, including matched valid-case N,
  // at this shared automatic/manual boundary, before any artifact publication.
  await assertFixedPopulationArtifactDisclosure({
    principal: input.principal ?? { userId: input.generatedByUserId, platformRole: 'STANDARD' },
    artifact: {
      organizationId: input.series.organizationId,
      analysisKind: definition.analysisKind,
      cohortSnapshotId: null,
      artifactPayload: payload,
    },
  })
  return createOrReuseLongitudinalReportingArtifact({
    organizationId: input.series.organizationId,
    seriesId: input.series.id,
    specId: input.spec.id,
    analysisIdentityHash,
    artifactPayload: payload,
    snapshotHash: canonicalHash(payload),
    waveBindings,
    generatedByUserId: input.generatedByUserId,
    generatedAt,
    privacyExposures: input.privacyExposures,
  })
}

const protectedManifest = (input: {
  batch: ReportingObservationBatchV1
  subjectUserId: string
  relationshipKind: string
  perspective: ReportingObservationPerspectiveV1
  allowedExecutionIds: ReadonlySet<string>
}): { manifest: ReportingProtectedArtifactInputV1[]; resolvedEvidence: ReportingObservationBatchV1['resolved'] } => {
  const selectedResolved = input.batch.resolved.filter((row) => (
    input.allowedExecutionIds.has(row.executionId)
    && row.subject.userId === input.subjectUserId
    && row.relationshipKind === input.relationshipKind
    && row.perspective === input.perspective
  ))
  const selectedUnresolved = input.batch.unresolved.filter((row) => (
    input.allowedExecutionIds.has(row.executionId)
    && row.subject.userId === input.subjectUserId
    && row.relationshipKind === input.relationshipKind
    && row.perspective === input.perspective
  ))
  const matchedIds = new Set([...selectedResolved, ...selectedUnresolved].map((row) => row.executionId))
  if (matchedIds.size !== input.allowedExecutionIds.size) {
    reportingFail('REPORT_PROTECTED_SOURCE_INVALID', 'protected execution allowlist contains rows outside the frozen source tuple', 409)
  }
  const manifest: ReportingProtectedArtifactInputV1[] = [
    ...selectedResolved.map((row) => ({
      executionId: row.executionId,
      respondentUserId: row.respondent.userId,
      respondentMembershipId: row.respondent.membershipId,
      state: 'COMPLETED' as const,
      canonicalResultHash: row.canonicalResultHash,
      scientificMaturity: row.scientificMaturity,
      provenanceState: row.provenanceState,
      scientificProvenanceHash: row.scientificProvenanceHash,
    })),
    ...selectedUnresolved.map((row) => ({
      executionId: row.executionId,
      respondentUserId: row.respondent.userId,
      respondentMembershipId: row.respondent.membershipId,
      state: 'MISSING' as const,
      canonicalResultHash: null,
      scientificMaturity: null,
      provenanceState: null,
      scientificProvenanceHash: null,
    })),
  ].sort((a, b) => a.respondentUserId.localeCompare(b.respondentUserId) || a.executionId.localeCompare(b.executionId))
  return { manifest, resolvedEvidence: selectedResolved }
}

export const createProtectedFeedbackArtifact = async (input: {
  organizationId: string
  runId: string
  trackId: string
  subjectActorSnapshotId: string
  subjectUserId: string
  relationshipKind: string
  perspective: ReportingObservationPerspectiveV1
  batch: ReportingObservationBatchV1
  allowedExecutionIds: ReadonlySet<string>
  spec: ReportingAnalysisSpecRecord<ReportingProtectedFeedbackSpecV1>
  generatedByUserId: string
  generatedAt?: Date
}): Promise<ReportingProtectedArtifactRecord> => {
  if (input.spec.status !== 'PUBLISHED') reportingFail('REPORT_SPEC_NOT_PUBLISHED', 'protected feedback requires a published spec', 409)
  if (
    input.batch.organizationId !== input.organizationId
    || input.batch.runId !== input.runId
    || input.batch.trackId !== input.trackId
  ) reportingFail('REPORT_PROTECTED_SOURCE_INVALID', 'protected feedback batch does not match frozen Run/Track source', 409)
  if (input.allowedExecutionIds.size === 0) reportingFail('REPORT_PROTECTED_SOURCE_INVALID', 'protected feedback fixed source is empty', 409)

  const separated = buildSeparatedMultiRaterObservations({
    subjectUserId: input.subjectUserId,
    batches: [input.batch],
    metricRules: input.spec.definition.metricRules,
    allowedExecutionIds: input.allowedExecutionIds,
  })
  const built = buildProtectedFeedbackProjection({
    separated,
    subjectUserId: input.subjectUserId,
    trackId: input.trackId,
    relationshipKind: input.relationshipKind,
    perspective: input.perspective,
    sourceMinimumRespondents: input.batch.resourceMinimumN,
    spec: input.spec.definition,
  })
  const { manifest, resolvedEvidence } = protectedManifest(input)
  const evidence = reportingEvidenceFor(separated.observations ?? resolvedEvidence, input.spec.definition.reportEvidenceCeiling)
  const source = {
    kind: 'RUN_TRACK_PROTECTED' as const,
    runId: input.runId,
    trackId: input.trackId,
    subjectActorSnapshotId: input.subjectActorSnapshotId,
    subjectUserId: input.subjectUserId,
    relationshipKind: input.relationshipKind,
    perspective: input.perspective,
  }
  const inputIdentityHash = canonicalHash({
    schema: 'ReportingProtectedInputIdentityV1',
    organizationId: input.organizationId,
    source,
    resource: {
      family: input.batch.resourceFamily,
      key: input.batch.resourceKey,
      version: input.batch.resourceVersion,
      minimumN: input.batch.resourceMinimumN,
    },
    manifest,
  })
  const analysisIdentityHash = canonicalHash({
    schema: 'ReportingPr4AnalysisIdentityV1',
    analysisKind: 'PROTECTED_FEEDBACK',
    policyDomain: 'ORG_PROTECTED_FEEDBACK_V1',
    organizationId: input.organizationId,
    engine: { key: input.spec.definition.engineKey, version: input.spec.definition.engineVersion },
    spec: { id: input.spec.id, hash: input.spec.specHash, definition: input.spec.definition },
    source,
    inputIdentityHash,
  })
  const generatedAt = input.generatedAt ?? new Date()
  const payload: ReportingProtectedArtifactPayloadV1 = {
    schemaVersion: 1,
    artifactId: randomUUID(),
    organizationId: input.organizationId,
    analysisKind: 'PROTECTED_FEEDBACK',
    policyDomain: 'ORG_PROTECTED_FEEDBACK_V1',
    source,
    resource: { family: input.batch.resourceFamily, key: input.batch.resourceKey, version: input.batch.resourceVersion },
    specId: input.spec.id,
    specHash: input.spec.specHash,
    analysisIdentityHash,
    generatedByUserId: input.generatedByUserId,
    generatedAt: generatedAt.toISOString(),
    inputManifest: manifest,
    inputIdentityHash,
    maturityProfile: evidence.profile,
    evidence: { level: evidence.level, limitations: evidence.limitations },
    projection: built.projection,
  }
  return createOrReuseProtectedReportingArtifact({
    organizationId: input.organizationId,
    specId: input.spec.id,
    analysisIdentityHash,
    artifactPayload: payload,
    snapshotHash: canonicalHash(payload),
    generatedByUserId: input.generatedByUserId,
    generatedAt,
  })
}
