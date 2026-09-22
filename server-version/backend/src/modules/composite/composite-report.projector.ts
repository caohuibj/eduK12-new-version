import type { DecryptedCompositeAnalysisSnapshot } from './composite-analysis-snapshot.service'
import type { FrozenReportPackageSnapshot } from '../cognitive-analysis/report-package-freeze'
import type { CompositePackageReport, CompositeReportAudience, CompositeReportProjectionInput } from './composite-report.types'
import * as legacy from './composite-report.projector.legacy'
import { createScaleProjectionContext } from '../scale/projection/context-factory'
import { resolveEffectiveScaleDisclosure } from '../scale/projection/context'
import { projectScaleUnitReport, type ScaleUnitReport } from '../reporting/scale-unit-report'
import type { EffectiveScaleDisclosureSnapshot, ScaleProjectionContext } from '../scale/projection/types'

const scaleAudienceFor = (audience: CompositeReportAudience) => (
  audience === 'participant' ? 'subject' : audience
) as 'subject' | 'teacher' | 'researcher'

const frozenPolicyFromUnit = (unit: any): EffectiveScaleDisclosureSnapshot | undefined => {
  const candidate = unit?.__scaleProjectionPolicy
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined
  return candidate as EffectiveScaleDisclosureSnapshot
}

const contextForScaleUnit = (unit: any, audience: CompositeReportAudience): ScaleProjectionContext => createScaleProjectionContext({
  instrumentKey: unit?.scaleCode ?? unit?.result?.instrument?.code ?? null,
  instrumentVersion: unit?.method?.instrumentVersion ?? unit?.result?.instrument?.instrumentVersion ?? unit?.instrumentVersion ?? null,
  audience: scaleAudienceFor(audience),
  purpose: 'report',
  frozenPolicy: frozenPolicyFromUnit(unit),
})

const strictScaleUnit = (unit: any, audience: CompositeReportAudience): any => {
  const internal: ScaleUnitReport = {
    itemId: unit?.itemId,
    type: 'SCALE',
    kind: 'scale',
    scaleId: unit?.scaleId ?? unit?.result?.instrument?.scaleId ?? 'unknown',
    scaleCode: unit?.scaleCode ?? unit?.result?.instrument?.code ?? null,
    label: unit?.label ?? unit?.scaleName ?? null,
    scaleName: unit?.scaleName ?? unit?.result?.instrument?.name ?? '量表',
    result: unit?.result ?? null,
    quality: unit?.quality ?? unit?.result?.quality ?? null,
    scores: Array.isArray(unit?.scores) ? unit.scores : Array.isArray(unit?.result?.scores) ? unit.result.scores : [],
    references: Array.isArray(unit?.references) ? unit.references : Array.isArray(unit?.result?.references) ? unit.result.references : [],
    interpretations: Array.isArray(unit?.interpretations) ? unit.interpretations : Array.isArray(unit?.result?.interpretations) ? unit.result.interpretations : [],
    caveats: Array.isArray(unit?.caveats) ? unit.caveats.map(String) : Array.isArray(unit?.result?.caveats) ? unit.result.caveats.map(String) : [],
    disclaimer: typeof unit?.disclaimer === 'string'
      ? unit.disclaimer
      : typeof unit?.result?.disclaimer === 'string'
        ? unit.result.disclaimer
        : '',
    completedAt: unit?.completedAt ?? null,
    totalTime: typeof unit?.totalTime === 'number' ? unit.totalTime : null,
    method: unit?.method ?? unit?.result?.method ?? null,
    ...(unit?.decryptError ? { decryptError: true } : {}),
  }
  return projectScaleUnitReport(internal, contextForScaleUnit(unit, audience))
}

export const projectCompositeUnitReports = (
  unitReports: any[],
  audience: CompositeReportAudience,
  context: 'collection' | 'package' = 'package',
): any[] => unitReports.flatMap((unit) => {
  if (!unit || typeof unit !== 'object' || Array.isArray(unit)) return []
  if (unit.type === 'SCALE') return [strictScaleUnit(unit, audience)]
  return legacy.projectCompositeUnitReports([unit], audience, context)
})

const replaceScaleUnits = (
  projected: Record<string, any>,
  source: Record<string, any>,
  audience: CompositeReportAudience,
  context: 'collection' | 'package',
): Record<string, any> => ({
  ...projected,
  ...(source.productKind === 'QUESTIONNAIRE' ? { productKind: 'QUESTIONNAIRE', reportMode: 'COLLECTION_ONLY' } : {}),
  unitReports: projectCompositeUnitReports(Array.isArray(source.unitReports) ? source.unitReports : [], audience, context),
})

const restrictedScaleCodes = (
  packageSnapshot: FrozenReportPackageSnapshot,
  audience: CompositeReportAudience,
): Set<string> => {
  const restricted = new Set<string>()
  // Historical frozen package fixtures predate analysisProtocolSnapshot. They
  // remain readable; without a frozen Scale measurement list there is no
  // lineage claim to promote, so this guard returns an empty set rather than
  // crashing an otherwise valid report/export projection.
  const measurements = packageSnapshot.analysisProtocolSnapshot?.scaleMeasurements ?? []
  for (const measurement of measurements) {
    const context = createScaleProjectionContext({
      instrumentKey: measurement.scaleCode,
      instrumentVersion: measurement.instrumentVersion ?? null,
      audience: scaleAudienceFor(audience),
      purpose: 'report',
    })
    if (!resolveEffectiveScaleDisclosure(context).numericScores) restricted.add(measurement.scaleCode)
  }
  return restricted
}

const sanitizeSnapshotForRestrictedScaleInputs = (
  snapshot: DecryptedCompositeAnalysisSnapshot,
  restrictedCodes: Set<string>,
): DecryptedCompositeAnalysisSnapshot => {
  if (restrictedCodes.size === 0) return snapshot
  const payload: any = structuredClone(snapshot.payload)
  const hiddenEvidenceIds = new Set<string>(
    (Array.isArray(payload.evidence) ? payload.evidence : [])
      .filter((item: any) => item?.sourceType === 'scale_dimension' && restrictedCodes.has(String(item?.provenance?.scaleCode ?? '')))
      .map((item: any) => String(item.id)),
  )
  if (hiddenEvidenceIds.size === 0) return snapshot

  payload.evidence = (Array.isArray(payload.evidence) ? payload.evidence : [])
    .filter((item: any) => !hiddenEvidenceIds.has(String(item?.id)))
  payload.cognitiveDomains = (Array.isArray(payload.cognitiveDomains) ? payload.cognitiveDomains : [])
    .filter((domain: any) => !(Array.isArray(domain?.evidence) && domain.evidence.some((item: any) => hiddenEvidenceIds.has(String(item?.id)))))
  payload.recommendations = (Array.isArray(payload.recommendations) ? payload.recommendations : [])
    .filter((item: any) => !(Array.isArray(item?.evidenceRefs) && item.evidenceRefs.some((ref: unknown) => hiddenEvidenceIds.has(String(ref)))))
  payload.crossSourceFindings = (Array.isArray(payload.crossSourceFindings) ? payload.crossSourceFindings : [])
    .filter((item: any) => !(Array.isArray(item?.evidenceRefs) && item.evidenceRefs.some((ref: unknown) => hiddenEvidenceIds.has(String(ref)))))
  payload.qualitySummary = {
    interpretableModules: 0,
    excludedModules: [],
    warnings: ['RESTRICTED_SCALE_INPUTS_OMITTED'],
  }
  payload.limitations = [
    ...(Array.isArray(payload.limitations) ? payload.limitations.map(String) : []),
    '当前受众无权查看的量表输入未参与本次个体化综合输出。',
  ]
  return { ...snapshot, payload }
}

const safeSnapshotFor = (
  packageSnapshot: FrozenReportPackageSnapshot,
  snapshot: DecryptedCompositeAnalysisSnapshot,
  audience: CompositeReportAudience,
) => sanitizeSnapshotForRestrictedScaleInputs(snapshot, restrictedScaleCodes(packageSnapshot, audience))

export const projectCompositePackageAnalysis = (input: {
  packageSnapshot: FrozenReportPackageSnapshot
  snapshot: DecryptedCompositeAnalysisSnapshot
  audience: CompositeReportAudience
}): CompositePackageReport => legacy.projectCompositePackageAnalysis({
  ...input,
  snapshot: safeSnapshotFor(input.packageSnapshot, input.snapshot, input.audience),
})

export const projectCompositeReport = (input: CompositeReportProjectionInput): Record<string, any> => {
  const safeSnapshot = safeSnapshotFor(input.packageSnapshot, input.snapshot, input.audience)
  const projected = legacy.projectCompositeReport({ ...input, snapshot: safeSnapshot })
  return replaceScaleUnits(projected, input.report, input.audience, 'package')
}

export const projectCompositeCollectionReport = (
  report: Record<string, any>,
  audience: CompositeReportAudience,
): Record<string, any> => replaceScaleUnits(
  legacy.projectCompositeCollectionReport(report, audience),
  report,
  audience,
  'collection',
)
