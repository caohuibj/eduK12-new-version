import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { getContentReleaseBatch } from '../measurement-content/repository'
import {
  DECLARATIVE_REPORT_GENERATOR,
  renderDeclaredReport,
  type ReportMetricFact,
  type ReportReferenceFact,
} from '../measurement-content/report-renderer'
import type { AssessmentStaticImageAssetIdentityV1 } from '../assessment-media/assessment-image'
import type { ResearchFrozenUnit } from './publication.service'
import type { SurveyComputedFinal } from './final.compute'
import type { SurveyParticipantFeedbackProjection } from './participant-feedback-response'

export type SurveyRenderedDeclaredReport = ReturnType<typeof renderDeclaredReport>

type ReadDb = Pick<Prisma.TransactionClient, '$queryRaw'> | typeof prisma
type DescriptiveMeasurement = Extract<SurveyParticipantFeedbackProjection, { kind: 'DESCRIPTIVE' }>['measurements'][number]
type RawMeasurement = Extract<DescriptiveMeasurement, { feedbackKind: 'RAW_METRICS' }>

const isRawMeasurement = (item: DescriptiveMeasurement): item is RawMeasurement => (
  'feedbackKind' in item && item.feedbackKind === 'RAW_METRICS'
)

interface DeclaredCandidate {
  index: number
  unit: ResearchFrozenUnit
  reportRelease: { releaseId: string; contentHash: string }
  measurementRelease: { releaseId: string; contentHash: string }
  interpreted: NonNullable<SurveyComputedFinal['interpretation']>['units'][number]
}

function collectDeclaredCandidates(
  units: readonly ResearchFrozenUnit[],
  result: SurveyComputedFinal,
  projected: SurveyParticipantFeedbackProjection,
): DeclaredCandidate[] {
  if (projected.kind !== 'DESCRIPTIVE' || !result.interpretation?.units?.length) return []
  const unitByKey = new Map(units.map((u) => [u.instrumentKey, u]))
  const interpretedByKey = new Map(result.interpretation.units.map((u) => [u.instrumentKey, u]))
  const candidates: DeclaredCandidate[] = []
  projected.measurements.forEach((measurement, index) => {
    if (!isRawMeasurement(measurement)) return
    const unit = unitByKey.get(measurement.instrumentKey)
    if (!unit?.contentSelection?.reportRelease || !unit.measurementRelease) return
    if (unit.sourceProvenance?.reportConfigured === false || unit.reportEligibility?.eligible === false) return
    const interpreted = interpretedByKey.get(unit.instrumentKey)
    if (!interpreted || interpreted.report.status !== 'READY') return
    candidates.push({
      index,
      unit,
      reportRelease: unit.contentSelection.reportRelease,
      measurementRelease: unit.measurementRelease,
      interpreted,
    })
  })
  return candidates
}

/**
 * Attach frozen declarative REPORT renderings (thresholds/bands, narrative prose,
 * charts, asset blocks) to authorized Survey participant feedback measurements.
 *
 * Uses bounded-cached getContentReleaseBatch so warm reads do zero extra DB I/O
 * and units without a bound REPORT release pay zero cost.
 */
export async function attachSurveyParticipantDeclaredReports(
  units: readonly ResearchFrozenUnit[],
  result: SurveyComputedFinal,
  projected: SurveyParticipantFeedbackProjection,
  db: ReadDb = prisma,
): Promise<SurveyParticipantFeedbackProjection> {
  if (projected.kind !== 'DESCRIPTIVE') return projected
  const candidates = collectDeclaredCandidates(units, result, projected)
  if (!candidates.length) return projected

  const releaseIds = [
    ...new Set(candidates.flatMap((c) => [c.measurementRelease.releaseId, c.reportRelease.releaseId])),
  ]
  const releases = await getContentReleaseBatch(db as Prisma.TransactionClient, releaseIds)

  let changed = false
  const nextMeasurements = [...projected.measurements]

  for (const candidate of candidates) {
    const measurement = releases.get(candidate.measurementRelease.releaseId)
    const report = releases.get(candidate.reportRelease.releaseId)
    if (!measurement || measurement.layer !== 'MEASUREMENT'
      || measurement.contentHash !== candidate.measurementRelease.contentHash
      || measurement.status === 'REVOKED') continue
    if (!report || report.layer !== 'REPORT'
      || report.contentHash !== candidate.reportRelease.contentHash
      || report.status === 'REVOKED'
      || report.content.generatorVersion !== DECLARATIVE_REPORT_GENERATOR
      || candidate.interpreted.report.generatorVersion !== report.content.generatorVersion
      || report.content.measurements.length !== 1
      || report.content.measurements[0].releaseId !== measurement.releaseId
      || report.content.measurements[0].contentHash !== measurement.contentHash) continue

    const item = nextMeasurements[candidate.index]
    if (!isRawMeasurement(item)) continue

    const reportMetricKeys = new Set(report.content.metricKeys)
    const allowedMetrics = item.metrics.filter((m) => reportMetricKeys.has(m.key))
    const allowedMetricKeys = new Set(allowedMetrics.map((m) => m.key))
    if (!allowedMetricKeys.size) continue

    const metricFacts: ReportMetricFact[] = allowedMetrics.map((m) => ({
      metricKey: m.key,
      value: typeof m.value === 'number' && Number.isFinite(m.value) ? m.value : null,
      unit: measurement.content.metrics.find((v) => v.metricKey === m.key)?.unit ?? 'unknown',
      status: item.quality === 'interpretable' && m.status === 'OK' ? 'INTERPRETABLE' : 'UNAVAILABLE',
    }))

    const referenceFacts: ReportReferenceFact[] = candidate.interpreted.references
      .filter((ref) => allowedMetricKeys.has(ref.metricKey))
      .map((ref) => ({
        metricKey: ref.metricKey,
        referenceKind: ref.referenceKind,
        status: ref.status === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE',
        bandKey: ref.values?.bandKey ?? null,
      }))

    const declaredReport = renderDeclaredReport(report.content.template, metricFacts, referenceFacts)
    nextMeasurements[candidate.index] = {
      ...item,
      declaredReport,
    }
    changed = true
  }

  return changed ? { ...projected, measurements: nextMeasurements } : projected
}

/**
 * Authorize a static image asset referenced by an ASSET block inside a participant's
 * rendered declaredReport, verifying against the frozen REPORT release's assetRefs.
 */
export async function resolveSurveyDeclaredReportAsset(
  units: readonly ResearchFrozenUnit[],
  projected: SurveyParticipantFeedbackProjection,
  assetId: string,
  db: ReadDb = prisma,
): Promise<AssessmentStaticImageAssetIdentityV1 | null> {
  if (projected.kind !== 'DESCRIPTIVE') return null
  const unitByKey = new Map(units.map((u) => [u.instrumentKey, u]))
  const matchingReleasePointers: Array<{ releaseId: string; contentHash: string }> = []

  for (const item of projected.measurements) {
    if (!isRawMeasurement(item) || !item.declaredReport) continue
    const hasAssetBlock = Array.isArray(item.declaredReport.blocks)
      && item.declaredReport.blocks.some((block: unknown) => (
        block !== null && typeof block === 'object'
        && (block as { type?: unknown }).type === 'ASSET'
        && (block as { assetId?: unknown }).assetId === assetId
      ))
    if (!hasAssetBlock) continue
    const unit = unitByKey.get(item.instrumentKey)
    if (unit?.contentSelection?.reportRelease) {
      matchingReleasePointers.push(unit.contentSelection.reportRelease)
    }
  }
  if (!matchingReleasePointers.length) return null

  const releases = await getContentReleaseBatch(
    db as Prisma.TransactionClient,
    [...new Set(matchingReleasePointers.map((p) => p.releaseId))],
  )
  for (const pointer of matchingReleasePointers) {
    const report = releases.get(pointer.releaseId)
    if (!report || report.layer !== 'REPORT' || report.contentHash !== pointer.contentHash || report.status === 'REVOKED') continue
    const ref = report.assetRefs.find((asset) => asset.assetId === assetId)
    if (ref && ['image/png', 'image/jpeg', 'image/webp'].includes(ref.mediaType)) {
      return {
        assetId: ref.assetId,
        contentHash: ref.sha256,
        mimeType: ref.mediaType as AssessmentStaticImageAssetIdentityV1['mimeType'],
      }
    }
  }
  return null
}
