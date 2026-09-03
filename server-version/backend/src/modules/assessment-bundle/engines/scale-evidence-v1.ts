import type {
  BundleAnalysisEngineV1,
  BundleEngineInputV1,
  BundleEngineResultV1,
} from '../registry'
import {
  assertUniqueScaleSources,
  assertUniqueValueSelectors,
  type BundleFrozenScaleScoreV1,
  type BundleFrozenScaleSourceV1,
} from '../sources'
import type {
  EvidenceItemV1,
  EvidenceQualityStateV1,
  EvidenceRoleV1,
  FrozenBundleSlotBindingV3,
} from '../types'

export const SCALE_EVIDENCE_ENGINE_KEY = 'scale-evidence-v1' as const
export const SCALE_EVIDENCE_ENGINE_VERSION = '1.0.0' as const
export const SCALE_EVIDENCE_PAYLOAD_SCHEMA = 'scale-evidence-payload-v1' as const

export interface ScaleEvidenceScoreObservationV1 {
  slotKey: string
  instrumentKey: string
  scoreKey: string
  value: number | null
  scoreStatus: BundleFrozenScaleScoreV1['status']
  quality: EvidenceQualityStateV1
  /**
   * Classification key copied only from frozen criterionBand.key.
   * Engines must never invent this from a display label.
   */
  criterionBandKey: string | null
  classifiedFromLabel: false
}

export interface ScaleEvidencePayloadV1 {
  schema: typeof SCALE_EVIDENCE_PAYLOAD_SCHEMA
  reportingMode: 'strictly_descriptive'
  scores: ScaleEvidenceScoreObservationV1[]
  slotAssessments: Array<{
    slotKey: string
    instrumentKey: string
    instrumentVersion: string
    status: 'present' | 'missing' | 'version_mismatch' | 'invalid'
    quality: EvidenceQualityStateV1
    selectedScoreKeys: string[]
    notes: string[]
  }>
  limitations: string[]
}

/**
 * Multi-score selector: one Scale administration → multiple scoreKeys.
 * Returns only the requested scores; never a full ScaleResultV2 copy.
 */
export const selectScaleScores = (
  source: BundleFrozenScaleSourceV1,
  scoreKeys: string[],
): BundleFrozenScaleScoreV1[] => {
  const byKey = new Map(source.scores.map((score) => [score.scoreKey, score]))
  return scoreKeys.map((scoreKey) => {
    const hit = byKey.get(scoreKey)
    if (hit) return { ...hit }
    return {
      scoreKey,
      value: null,
      status: 'not_calculable' as const,
      criterionBandKey: null,
    }
  })
}

/**
 * Project selected scores into EvidenceItemV1 rows.
 * criterionBandKey is taken only from frozen criterionBand.key on the source score.
 */
export const projectScaleEvidenceItems = (input: {
  source: BundleFrozenScaleSourceV1
  scoreKeys: string[]
  constructKeyPrefix?: string
  role?: EvidenceRoleV1
}): EvidenceItemV1[] => {
  const selected = selectScaleScores(input.source, input.scoreKeys)
  const prefix = input.constructKeyPrefix ?? input.source.instrumentKey
  const role = input.role ?? 'PRIMARY'
  return selected.map((score) => {
    let quality: EvidenceQualityStateV1
    if (input.source.qualityState === 'invalid') quality = 'invalid'
    else if (score.status === 'not_calculable') quality = 'invalid'
    else if (score.status === 'limited' || input.source.qualityState === 'limited') quality = 'limited'
    else if (score.value === null) quality = 'limited'
    else quality = 'interpretable'

    return {
      evidenceKey: `${input.source.slotKey}.${prefix}.${score.scoreKey}.primary`,
      constructKey: `${prefix}.${score.scoreKey}`,
      source: {
        kind: 'SCALE_SCORE',
        slotKey: input.source.slotKey,
        scoreKey: score.scoreKey,
        sourceResultHash: input.source.sourceResultHash,
      },
      value: score.value === null
        ? { state: 'missing' as const }
        : { state: 'present' as const, value: score.value, unit: 'score' },
      quality,
      criterionBandKey: score.criterionBandKey,
      role,
    }
  })
}

const findSource = (
  sources: BundleFrozenScaleSourceV1[],
  slot: FrozenBundleSlotBindingV3,
): BundleFrozenScaleSourceV1 | undefined => (
  sources.find((source) => source.slotKey === slot.slotKey)
)

const qualityForScore = (
  sourceQuality: BundleFrozenScaleSourceV1['qualityState'],
  score: BundleFrozenScaleScoreV1,
): EvidenceQualityStateV1 => {
  if (sourceQuality === 'invalid') return 'invalid'
  if (score.status === 'not_calculable') return 'invalid'
  if (score.status === 'limited' || sourceQuality === 'limited') return 'limited'
  if (score.value === null) return 'limited'
  return 'interpretable'
}

const buildPayload = (input: BundleEngineInputV1): ScaleEvidencePayloadV1 => {
  const sources = input.scaleSources ?? []
  const scaleSlots = input.snapshot.slotBindings.filter((slot) => slot.unitType === 'SCALE')
  assertUniqueScaleSources(sources)
  assertUniqueValueSelectors(scaleSlots)
  const scores: ScaleEvidenceScoreObservationV1[] = []
  const slotAssessments: ScaleEvidencePayloadV1['slotAssessments'] = []
  const limitations = [
    '严格描述性 Scale 报告：不将低分自动解释为危机或诊断。',
    '分类仅读取冻结 criterionBand.key，禁止从显示标签推断。',
  ]

  for (const slot of scaleSlots) {
    const selectors = slot.valueSelectors && slot.valueSelectors.length > 0
      ? [...slot.valueSelectors]
      : []
    const source = findSource(sources, slot)

    if (!source) {
      slotAssessments.push({
        slotKey: slot.slotKey,
        instrumentKey: slot.instrumentKey,
        instrumentVersion: slot.instrumentVersion,
        status: 'missing',
        quality: slot.required ? 'invalid' : 'unavailable',
        selectedScoreKeys: selectors,
        notes: ['frozen Scale source missing for slot'],
      })
      continue
    }

    if (
      source.instrumentKey !== slot.instrumentKey
      || source.instrumentVersion !== slot.instrumentVersion
    ) {
      slotAssessments.push({
        slotKey: slot.slotKey,
        instrumentKey: slot.instrumentKey,
        instrumentVersion: slot.instrumentVersion,
        status: 'version_mismatch',
        quality: 'invalid',
        selectedScoreKeys: selectors,
        notes: [
          `source identity mismatch: got ${source.instrumentKey}@${source.instrumentVersion}`,
        ],
      })
      continue
    }

    if (source.qualityState === 'invalid') {
      slotAssessments.push({
        slotKey: slot.slotKey,
        instrumentKey: slot.instrumentKey,
        instrumentVersion: slot.instrumentVersion,
        status: 'invalid',
        quality: 'invalid',
        selectedScoreKeys: selectors,
        notes: ['frozen Scale result qualityState=invalid'],
      })
      continue
    }

    const selected = selectScaleScores(source, selectors)
    slotAssessments.push({
      slotKey: slot.slotKey,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      status: 'present',
      quality: source.qualityState,
      selectedScoreKeys: selectors,
      notes: [],
    })

    for (const score of selected) {
      scores.push({
        slotKey: slot.slotKey,
        instrumentKey: slot.instrumentKey,
        scoreKey: score.scoreKey,
        value: score.value,
        scoreStatus: score.status,
        quality: qualityForScore(source.qualityState, score),
        // Only the frozen key — never a label.
        criterionBandKey: score.criterionBandKey,
        classifiedFromLabel: false,
      })
    }
  }

  if (scores.some((score) => score.criterionBandKey === null)) {
    limitations.push('部分 score 无冻结 criterionBand.key：仅描述分值，不作分类。')
  }

  return {
    schema: SCALE_EVIDENCE_PAYLOAD_SCHEMA,
    reportingMode: 'strictly_descriptive',
    scores,
    slotAssessments,
    limitations,
  }
}

export const runScaleEvidenceV1: BundleAnalysisEngineV1 = (
  input: BundleEngineInputV1,
): BundleEngineResultV1 => {
  const ref = input.snapshot.engine
  if (ref.key !== SCALE_EVIDENCE_ENGINE_KEY || ref.version !== SCALE_EVIDENCE_ENGINE_VERSION) {
    return {
      kind: 'UNAVAILABLE',
      reason: `engine ref mismatch: expected ${SCALE_EVIDENCE_ENGINE_KEY}@${SCALE_EVIDENCE_ENGINE_VERSION}`,
    }
  }
  return {
    kind: 'COMPUTED',
    payload: buildPayload(input),
  }
}
