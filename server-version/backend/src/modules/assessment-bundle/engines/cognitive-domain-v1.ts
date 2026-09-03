import type {
  BundleAnalysisEngineV1,
  BundleEngineInputV1,
  BundleEngineResultV1,
} from '../registry'
import type { BundleFrozenCognitiveSourceV1 } from '../sources'
import type { EvidenceQualityStateV1, FrozenBundleSlotBindingV3 } from '../types'

export const COGNITIVE_DOMAIN_ENGINE_KEY = 'cognitive-domain-v1' as const
export const COGNITIVE_DOMAIN_ENGINE_VERSION = '1.0.0' as const

export const COGNITIVE_DOMAIN_PAYLOAD_SCHEMA = 'cognitive-domain-payload-v1' as const

type FacetRole = 'PRIMARY' | 'SUPPORTING'

interface MetricFacetBinding {
  facetKey: string
  facetLabel: string
  role: FacetRole
}

/** Known task→facet bindings for response_inhibition. Identity only — no UNIT submit changes. */
const RESPONSE_INHIBITION_METRIC_FACETS: Record<string, Record<string, MetricFacetBinding>> = {
  gonogo: {
    commissionRate: { facetKey: 'action_withholding', facetLabel: '动作克制', role: 'PRIMARY' },
    dPrime: { facetKey: 'action_withholding', facetLabel: '动作克制', role: 'PRIMARY' },
  },
  sst: {
    ssrtMs: { facetKey: 'action_cancellation', facetLabel: '动作停止', role: 'PRIMARY' },
    pRespondStop: { facetKey: 'action_cancellation', facetLabel: '动作停止', role: 'SUPPORTING' },
  },
}

const DEFAULT_SELECTORS: Record<string, string[]> = {
  gonogo: ['commissionRate'],
  sst: ['ssrtMs'],
}

export type CognitiveDomainStatusV1 =
  | 'not_measured'
  | 'insufficient_quality'
  | 'descriptive_only'
  | 'interpretable'

export interface CognitiveDomainFacetObservationV1 {
  facetKey: string
  facetLabel: string
  slotKey: string
  instrumentKey: string
  metricKey: string
  value: number | string | boolean | null
  quality: EvidenceQualityStateV1
  role: FacetRole
}

export interface CognitiveDomainSlotAssessmentV1 {
  slotKey: string
  instrumentKey: string
  instrumentVersion: string
  status: 'present' | 'missing' | 'version_mismatch' | 'invalid'
  quality: EvidenceQualityStateV1
  notes: string[]
}

export interface CognitiveDomainPayloadV1 {
  schema: typeof COGNITIVE_DOMAIN_PAYLOAD_SCHEMA
  domainKey: 'response_inhibition'
  domainLabel: '反应抑制'
  status: CognitiveDomainStatusV1
  /** Explicitly null — this engine never emits a cognitive total score. */
  totalScore: null
  facets: CognitiveDomainFacetObservationV1[]
  slotAssessments: CognitiveDomainSlotAssessmentV1[]
  /**
   * Descriptive notes only. Never contains abnormality classifications when
   * reference norms are absent (and this v1 engine never emits abnormality).
   */
  classifications: Array<{ metricKey: string; kind: 'descriptive'; note: string }>
  abnormalityClassified: false
  limitations: string[]
}

const asScalar = (value: unknown): number | string | boolean | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' || typeof value === 'boolean') return value
  return null
}

const findSource = (
  sources: BundleFrozenCognitiveSourceV1[],
  slot: FrozenBundleSlotBindingV3,
): BundleFrozenCognitiveSourceV1 | undefined => (
  sources.find((source) => source.slotKey === slot.slotKey)
)

const assessSlot = (
  slot: FrozenBundleSlotBindingV3,
  source: BundleFrozenCognitiveSourceV1 | undefined,
): CognitiveDomainSlotAssessmentV1 => {
  if (!source) {
    return {
      slotKey: slot.slotKey,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      status: 'missing',
      quality: slot.required ? 'invalid' : 'unavailable',
      notes: ['frozen Cognitive source missing for slot'],
    }
  }
  if (
    source.instrumentKey !== slot.instrumentKey
    || source.instrumentVersion !== slot.instrumentVersion
  ) {
    return {
      slotKey: slot.slotKey,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      status: 'version_mismatch',
      quality: 'invalid',
      notes: [
        `source identity mismatch: got ${source.instrumentKey}@${source.instrumentVersion}`,
      ],
    }
  }
  if (source.qualityState === 'invalid') {
    return {
      slotKey: slot.slotKey,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      status: 'invalid',
      quality: 'invalid',
      notes: ['frozen Cognitive result qualityState=invalid'],
    }
  }
  return {
    slotKey: slot.slotKey,
    instrumentKey: slot.instrumentKey,
    instrumentVersion: slot.instrumentVersion,
    status: 'present',
    quality: source.qualityState,
    notes: [],
  }
}

const selectorsFor = (slot: FrozenBundleSlotBindingV3): string[] => {
  if (slot.valueSelectors && slot.valueSelectors.length > 0) return [...slot.valueSelectors]
  return DEFAULT_SELECTORS[slot.instrumentKey] ? [...DEFAULT_SELECTORS[slot.instrumentKey]] : []
}

const buildPayload = (input: BundleEngineInputV1): CognitiveDomainPayloadV1 => {
  const sources = input.cognitiveSources ?? []
  const cognitiveSlots = input.snapshot.slotBindings.filter((slot) => slot.unitType === 'COGNITIVE')
  const slotAssessments = cognitiveSlots.map((slot) => assessSlot(slot, findSource(sources, slot)))
  const facets: CognitiveDomainFacetObservationV1[] = []
  const classifications: CognitiveDomainPayloadV1['classifications'] = []
  const limitations: string[] = [
    '描述性领域画像：不产生认知总分，不构成诊断。',
  ]

  let anyNorms = false
  for (const slot of cognitiveSlots) {
    const assessment = slotAssessments.find((row) => row.slotKey === slot.slotKey)!
    const source = findSource(sources, slot)
    if (!source || assessment.status !== 'present') continue
    if (source.hasReferenceNorms) anyNorms = true

    for (const metricKey of selectorsFor(slot)) {
      const binding = RESPONSE_INHIBITION_METRIC_FACETS[slot.instrumentKey]?.[metricKey]
      const raw = source.metrics[metricKey]
      const value = asScalar(raw)
      const metricQuality: EvidenceQualityStateV1 = (
        assessment.quality === 'interpretable' && value !== null
          ? 'interpretable'
          : assessment.quality === 'interpretable' && value === null
            ? 'limited'
            : assessment.quality
      )
      facets.push({
        facetKey: binding?.facetKey ?? 'unmapped',
        facetLabel: binding?.facetLabel ?? metricKey,
        slotKey: slot.slotKey,
        instrumentKey: slot.instrumentKey,
        metricKey,
        value,
        quality: metricQuality,
        role: binding?.role ?? 'SUPPORTING',
      })
      classifications.push({
        metricKey,
        kind: 'descriptive',
        note: source.hasReferenceNorms
          ? '参考常模可用，但仍仅作描述性报告，不判定异常。'
          : '无参考常模：仅报告原始/派生指标，不判定异常。',
      })
    }
  }

  if (!anyNorms) {
    limitations.push('缺少参考常模：不得将结果分类为异常。')
  }

  const qualities = slotAssessments.map((row) => row.quality)
  const allMissing = slotAssessments.every((row) => row.status === 'missing')
  const anyInvalid = slotAssessments.some((row) => (
    row.status === 'invalid' || row.status === 'version_mismatch' || row.quality === 'invalid'
  ))
  const anyLimited = qualities.includes('limited') || facets.some((facet) => facet.quality === 'limited')
  const interpretableFacets = facets.filter((facet) => facet.quality === 'interpretable')

  let status: CognitiveDomainStatusV1
  if (cognitiveSlots.length === 0 || allMissing) {
    status = 'not_measured'
  } else if (anyInvalid || interpretableFacets.length === 0) {
    status = 'insufficient_quality'
  } else if (!anyNorms || anyLimited) {
    status = 'descriptive_only'
  } else {
    // Interpretable metrics with norms still stay descriptive for this engine —
    // never promote to abnormality classification.
    status = 'interpretable'
  }

  return {
    schema: COGNITIVE_DOMAIN_PAYLOAD_SCHEMA,
    domainKey: 'response_inhibition',
    domainLabel: '反应抑制',
    status,
    totalScore: null,
    facets,
    slotAssessments,
    classifications,
    abnormalityClassified: false,
    limitations,
  }
}

export const runCognitiveDomainV1: BundleAnalysisEngineV1 = (
  input: BundleEngineInputV1,
): BundleEngineResultV1 => {
  const ref = input.snapshot.engine
  if (ref.key !== COGNITIVE_DOMAIN_ENGINE_KEY || ref.version !== COGNITIVE_DOMAIN_ENGINE_VERSION) {
    return {
      kind: 'UNAVAILABLE',
      reason: `engine ref mismatch: expected ${COGNITIVE_DOMAIN_ENGINE_KEY}@${COGNITIVE_DOMAIN_ENGINE_VERSION}`,
    }
  }
  return {
    kind: 'COMPUTED',
    payload: buildPayload(input),
  }
}
