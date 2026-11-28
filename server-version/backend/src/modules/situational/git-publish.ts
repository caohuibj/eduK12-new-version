import { readdirSync } from 'node:fs'
import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertAssessmentAssetReferencesReady, assessmentAssetIdentitySchema } from '../assessment-media/assessment-asset'
import { assertAssessmentOperationallyActive } from '../assessment-governance/operational-hold'
import { publishContentRelease } from '../measurement-content/repository'
import { DECLARATIVE_REPORT_GENERATOR } from '../measurement-content/report-renderer'
import { clone, type GovernedRow } from '../survey/governed-tool.model'
import { governedMediaRefs } from '../survey/governed-tool.media'
import { reconcileGitGovernedArtifact } from '../survey/governed-tool.service'
import { assertGitScalePublisher } from '../survey/standard-triplet.service'
import { readSjtGitReleasePlan, type SjtGitDeclaration } from './git-release'
import { sjtGitFrozenBindingSchema } from './git-release.binding'
import { prepareSjtSurveyPublication, sjtStandardMeasurementInput } from './standard-release.artifact'

const scope = { kind: 'PLATFORM' as const }
const provenanceKey = 'sjtGitRelease'
function prepareSurveyRelease(item: SjtGitDeclaration) {
  const { release, pkg } = item
  const { artifact, unit } = prepareSjtSurveyPublication(item)
  const references = governedMediaRefs(unit).map(ref => assessmentAssetIdentitySchema.parse(ref))
  const measurementInput = sjtStandardMeasurementInput(unit, {
    localId: 'git-sjt:' + pkg.key, version: release.contentVersion + '/' + release.parameterVersion,
    contentHash: item.axes.content, parameterHash: item.axes.parameters, dataCeiling: item.content.dataCeiling,
  })
  return { item, artifact, unit, references, measurementInput }
}

async function publishSurveyRelease(tx: Prisma.TransactionClient, prepared: ReturnType<typeof prepareSurveyRelease>, actorId: string, gitCommitSha: string) {
  const { item, artifact, unit, references, measurementInput } = prepared
  const { release, pkg, referenceSet, parameters } = item
  assertAssessmentOperationallyActive({ family: 'SITUATIONAL', key: pkg.key, version: pkg.instrumentVersion })
  if (references.length) {
    const assetIds = [...new Set(references.map(ref => ref.assetId))]
    const rows = await tx.storedAsset.findMany({
      where: { id: { in: assetIds }, deletedAt: null,
        OR: [{ accessScope: 'PUBLIC' }, { accessScope: 'PRIVATE', ownerId: actorId }] },
      select: { id: true },
    })
    if (rows.length !== assetIds.length) throw new Error('SJT_GIT_ASSET_RIGHTS_REQUIRED')
    await assertAssessmentAssetReferencesReady(references, tx)
  }
  const measurement = await publishContentRelease(tx, measurementInput, actorId)
  if (measurement.layer !== 'MEASUREMENT' || measurement.status !== 'PUBLISHED') throw new Error('SJT_GIT_MEASUREMENT_UNAVAILABLE')
  const pointer = { releaseId: measurement.releaseId, contentHash: measurement.contentHash }
  let publishedParameters = artifact.parameters
  if (referenceSet) {
    if (referenceSet.entries.some(entry => entry.governance?.measurementHash !== undefined &&
        entry.governance.measurementHash !== measurement.content.measurementHash)) throw new Error('SJT_GIT_REFERENCE_MEASUREMENT_MISMATCH')
    const reference = await publishContentRelease(tx, {
      family: 'SJT', layer: 'REFERENCE', key: 'git-sjt:' + pkg.key, version: release.parameterVersion,
      scope, sourceReleaseId: null, assetRefs: [], provenance: { parameterHash: item.axes.parameters },
      content: { projectionVersion: 1, measurement: pointer,
        entries: referenceSet.entries.map(entry => ({ metricKey: entry.scoreKey, referenceKind: entry.referenceKind, definition: entry })),
        evidence: { scientificMaturity: parameters.scientific.scientificMaturity } },
    }, actorId)
    if (reference.layer !== 'REFERENCE' || reference.status !== 'PUBLISHED') throw new Error('SJT_GIT_PARAMETER_UNAVAILABLE')
    publishedParameters = { ...clone(reference), sourceMeasurementHash: measurement.content.measurementHash }
  }
  const report = await publishContentRelease(tx, {
    family: 'SJT', layer: 'REPORT', key: 'git-sjt:' + pkg.key, version: release.reportVersion,
    scope, sourceReleaseId: null, assetRefs: [], provenance: { reportHash: item.axes.report },
    content: { projectionVersion: 1, measurements: [pointer], metricKeys: measurement.content.metrics.map(metric => metric.metricKey),
      audience: 'researcher', language: 'und', template: artifact.report!.template,
      generatorVersion: DECLARATIVE_REPORT_GENERATOR, effectiveDisclosure: item.effectiveDisclosure },
  }, actorId)
  if (report.layer !== 'REPORT' || report.status !== 'PUBLISHED') throw new Error('SJT_GIT_REPORT_UNAVAILABLE')
  const publishedUnit = { ...unit, provenance: {
    ...unit.provenance,
    governedMedia: { schemaVersion: 1, references, sharedBy: actorId },
    [provenanceKey]: { axes: item.axes, effectiveDisclosure: item.effectiveDisclosure,
      reportRelease: { releaseId: report.releaseId, contentHash: report.contentHash } },
  } }
  return reconcileGitGovernedArtifact(tx, actorId, { ...artifact, parameters: publishedParameters, unit: publishedUnit }, {
    online: true, allowedProducts: release.allowedEntries, gitCommitSha, measurement: pointer,
  })
}

export function prepareSjtGitReleases(root: string) {
  const keys = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  const plans = keys.flatMap(key => {
    const plan = readSjtGitReleasePlan(root, key)
    return plan ? plan.declarations : []
  })
  return {
    desired: new Map(plans.map(item => [item.pkg.key + ':' + item.release.releaseKey, item])),
    online: plans.filter(item => item.effectiveState === 'ONLINE').map(prepareSurveyRelease),
  }
}

export async function applySjtGitReleases(
  { desired, online }: ReturnType<typeof prepareSjtGitReleases>,
  tx: Prisma.TransactionClient,
  actorId: string,
  gitCommitSha: string,
) {
  await assertGitScalePublisher(tx, actorId)
  if (!/^[a-f0-9]{40}$/.test(gitCommitSha)) throw new Error('SJT_GIT_COMMIT_REQUIRED')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sjt-git-release-sync'))`
  const rows = await tx.$queryRaw<GovernedRow[]>`SELECT * FROM survey_governed_tools
    WHERE family='SJT' AND submitted_by=${actorId} AND approved_by=${actorId}
      AND tool_key LIKE 'SJT:git:%' ORDER BY id FOR UPDATE`
  for (const row of rows) {
    const binding = sjtGitFrozenBindingSchema.parse(row.snapshot.unit?.provenance[provenanceKey])
    const item = desired.get(row.tool_key.slice('SJT:git:'.length) + ':' + row.tool_version)
    if (item && canonicalHash(binding.axes) !== canonicalHash(item.axes)) throw new Error('SJT_GIT_RELEASE_IMMUTABLE')
  }
  const applied = []
  for (const release of online) applied.push(await publishSurveyRelease(tx, release, actorId, gitCommitSha))
  for (const row of rows) {
    const item = desired.get(row.tool_key.slice('SJT:git:'.length) + ':' + row.tool_version)
    if (item?.effectiveState === 'ONLINE' || item?.effectiveState === 'HOLD' || row.state !== 'ONLINE') continue
    applied.push(await reconcileGitGovernedArtifact(tx, actorId, row.snapshot, {
      online: false, allowedProducts: ['SURVEY'], gitCommitSha,
    }))
  }
  return applied
}

export async function syncSjtGitReleases(root: string, tx: Prisma.TransactionClient, actorId: string, gitCommitSha: string) {
  return applySjtGitReleases(prepareSjtGitReleases(root), tx, actorId, gitCommitSha)
}
