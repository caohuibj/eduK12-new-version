import type { ReportingIndividualProjectionV1 } from './types'

/** A separate participant DTO; researcher provenance and identifiers are never copied. */
export function projectParticipantLongitudinal(projection: ReportingIndividualProjectionV1, allowedMetricIds: readonly string[]) {
  const allowed = new Set(allowedMetricIds)
  const ordinals = new Map(projection.waves.map(w => [w.waveId, w.ordinal]))
  return {
    schemaVersion: 1 as const, kind: 'MY_LONGITUDINAL' as const,
    waves: projection.waves.map(w => ({
      ordinal: w.ordinal,
      metrics: Object.fromEntries(Object.entries(w.metrics).filter(([key]) => allowed.has(key)).map(([key, metric]) => [key,
        metric.state === 'present' && Number.isFinite(metric.value) ? { state: 'present', value: metric.value } : { state: 'missing' }])),
      evidenceLevel: w.evidence.level,
    })),
    ...(projection.referenceTrajectories ? {referenceTrajectories:{metrics:Object.fromEntries(Object.entries(projection.referenceTrajectories.metrics).filter(([key])=>allowed.has(key)).map(([key,snapshot])=>[key,{unified:snapshot.compatibilityDecision==='COMPATIBLE_LATER_REFERENCE',points:snapshot.points.map((p,i)=>({ordinal:p.ordinal??i+1,value:p.rawValue,bandLabel:p.reference?.status==='available'?p.reference.criterionBand?.label??null:null,referenceVersion:p.reference?.referenceVersion??null}))}]))}} : {}),
    comparisons: projection.comparisons.map(pair => ({
      fromOrdinal: ordinals.get(pair.fromWaveId), toOrdinal: ordinals.get(pair.toWaveId),
      metrics: Object.fromEntries(Object.entries(pair.metrics).filter(([key]) => allowed.has(key)).map(([key, metric]) => [key, {
        comparability: metric.comparability.level,
        ...(metric.comparability.allowedOperations.includes('NUMERIC_DELTA') && typeof metric.delta === 'number' && Number.isFinite(metric.delta) ? { delta: metric.delta } : {}),
      }])),
    })),
    limitations: ['多次结果仅反映所记录的测量情况，不能单独用于诊断或因果判断。', '缺失或不可比的测量不展示变化值。'],
  }
}
