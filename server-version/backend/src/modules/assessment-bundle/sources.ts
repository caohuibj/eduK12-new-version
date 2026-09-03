/**
 * Narrow frozen unit projections for Bundle engines.
 * Engines read these only — never raw trials/answers, never Prisma.
 * Deliberately smaller than CognitiveResultSnapshot / ScaleResultV2.
 *
 * Callers must project via projectBundle*Source helpers — do not freely invent
 * sourceResultHash / metrics / quality / criterionBandKey / hasReferenceNorms.
 */

import { parseCognitiveResultSnapshot } from '../cognitive/v2/result-snapshot'
import type { CognitiveResultSnapshot } from '../cognitive/v2/types'
import { parseScaleResultV2, type ScaleResultV2 } from '../scale/scale-result'
import { HEX_HASH } from './schema'
import { bundleContractFail } from './errors'
import type { FrozenBundleSlotBindingV3 } from './types'

export type BundleFrozenSourceQualityV1 = 'interpretable' | 'limited' | 'invalid'

export interface BundleFrozenCognitiveSourceV1 {
  slotKey: string
  instrumentKey: string
  instrumentVersion: string
  sourceResultHash: string
  metrics: Record<string, unknown>
  qualityState: BundleFrozenSourceQualityV1
  /**
   * Derived only from validated frozen Cognitive references by the projector.
   * Engines must not treat a caller-invented boolean as "norms available".
   */
  hasReferenceNorms: boolean
}

export interface BundleFrozenScaleScoreV1 {
  scoreKey: string
  value: number | null
  status: 'calculated' | 'limited' | 'not_calculable'
  /** Frozen criterionBand.key only — never a display label. */
  criterionBandKey: string | null
}

export interface BundleFrozenScaleSourceV1 {
  slotKey: string
  instrumentKey: string
  instrumentVersion: string
  sourceResultHash: string
  qualityState: BundleFrozenSourceQualityV1
  scores: BundleFrozenScaleScoreV1[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
)

const assertAuthoritativeResultHash = (sourceResultHash: string): string => {
  if (typeof sourceResultHash !== 'string' || !HEX_HASH.test(sourceResultHash)) {
    bundleContractFail(
      'SOURCE_RESULT_HASH',
      'sourceResultHash 必须是小写 SHA-256（64 hex），且由权威冻结结果绑定',
    )
  }
  return sourceResultHash
}

const assertInstrumentIdentity = (input: {
  expectedInstrumentKey: string
  expectedInstrumentVersion: string
  actualKey: string
  actualVersion: string
  label: string
}): void => {
  if (
    input.actualKey !== input.expectedInstrumentKey
    || input.actualVersion !== input.expectedInstrumentVersion
  ) {
    bundleContractFail(
      'SOURCE_IDENTITY_MISMATCH',
      `${input.label} identity 必须精确匹配 slot：expected ${input.expectedInstrumentKey}@${input.expectedInstrumentVersion}, got ${input.actualKey}@${input.actualVersion}`,
    )
  }
}

const hasUsableCognitiveReferenceNorms = (snapshot: CognitiveResultSnapshot): boolean => {
  if (snapshot.quality.state === 'invalid') return false
  return snapshot.references.some((entry) => {
    if (!isRecord(entry)) return false
    return entry.status === 'available'
  })
}

const criterionBandKeyFromScaleResult = (
  result: ScaleResultV2,
  scoreKey: string,
): string | null => {
  // Invalid results never expose criterion bands at the Bundle boundary.
  if (result.quality.status === 'invalid') return null
  const score = result.scores.find((candidate) => candidate.key === scoreKey)
  if (!score || score.status === 'not_calculable') return null

  const reference = result.references.find((candidate) => {
    if (!isRecord(candidate)) return false
    return candidate.scoreKey === scoreKey && candidate.status === 'available'
  })
  if (!reference || !isRecord(reference)) return null
  const band = isRecord(reference.criterionBand) ? reference.criterionBand : null
  if (!band || typeof band.key !== 'string' || band.key.length === 0) return null
  return band.key
}

/**
 * Project a validated CognitiveResultSnapshot into the narrow Bundle source.
 * hasReferenceNorms is derived from frozen references — never a bare caller flag.
 */
export const projectBundleCognitiveSource = (input: {
  slotKey: string
  expectedInstrumentKey: string
  expectedInstrumentVersion: string
  /** Authoritative lowercase SHA-256 (e.g. CanonicalUnitResultEnvelope.resultHash). */
  sourceResultHash: string
  result: unknown
}): BundleFrozenCognitiveSourceV1 => {
  const sourceResultHash = assertAuthoritativeResultHash(input.sourceResultHash)
  const snapshot = parseCognitiveResultSnapshot(input.result)
  assertInstrumentIdentity({
    expectedInstrumentKey: input.expectedInstrumentKey,
    expectedInstrumentVersion: input.expectedInstrumentVersion,
    actualKey: snapshot.testType,
    actualVersion: snapshot.configVersion,
    label: 'Cognitive',
  })

  return {
    slotKey: input.slotKey,
    instrumentKey: snapshot.testType,
    instrumentVersion: snapshot.configVersion,
    sourceResultHash,
    metrics: { ...snapshot.metrics },
    qualityState: snapshot.quality.state,
    hasReferenceNorms: hasUsableCognitiveReferenceNorms(snapshot),
  }
}

/**
 * Project a validated ScaleResultV2 into the narrow Bundle source.
 * Callers cannot invent criterionBandKey / quality / score values.
 */
export const projectBundleScaleSource = (input: {
  slotKey: string
  expectedInstrumentKey: string
  expectedInstrumentVersion: string
  /** Authoritative lowercase SHA-256 (e.g. CanonicalUnitResultEnvelope.resultHash). */
  sourceResultHash: string
  result: unknown
}): BundleFrozenScaleSourceV1 => {
  const sourceResultHash = assertAuthoritativeResultHash(input.sourceResultHash)
  const result = parseScaleResultV2(input.result)
  assertInstrumentIdentity({
    expectedInstrumentKey: input.expectedInstrumentKey,
    expectedInstrumentVersion: input.expectedInstrumentVersion,
    actualKey: result.instrument.code,
    actualVersion: result.instrument.instrumentVersion,
    label: 'Scale',
  })

  const seenScoreKeys = new Set<string>()
  const scores: BundleFrozenScaleScoreV1[] = result.scores.map((score) => {
    if (seenScoreKeys.has(score.key)) {
      bundleContractFail('SOURCE_SCORE_KEY_DUPLICATE', `Scale scoreKey 重复: ${score.key}`)
    }
    seenScoreKeys.add(score.key)

    if (score.status === 'not_calculable') {
      return {
        scoreKey: score.key,
        value: null,
        status: 'not_calculable',
        criterionBandKey: null,
      }
    }

    return {
      scoreKey: score.key,
      value: score.value,
      status: score.status,
      criterionBandKey: criterionBandKeyFromScaleResult(result, score.key),
    }
  })

  // Belt-and-suspenders: invalid quality strips all bands even if references linger.
  if (result.quality.status === 'invalid') {
    for (const score of scores) score.criterionBandKey = null
  }

  return {
    slotKey: input.slotKey,
    instrumentKey: result.instrument.code,
    instrumentVersion: result.instrument.instrumentVersion,
    sourceResultHash,
    qualityState: result.quality.status,
    scores,
  }
}

/** Fail-closed: at most one Cognitive source per slotKey. */
export const assertUniqueCognitiveSources = (
  sources: BundleFrozenCognitiveSourceV1[],
): void => {
  const seen = new Set<string>()
  for (const source of sources) {
    if (seen.has(source.slotKey)) {
      bundleContractFail('SOURCE_SLOT_DUPLICATE', `重复 Cognitive slotKey: ${source.slotKey}`)
    }
    seen.add(source.slotKey)
  }
}

/** Fail-closed: at most one Scale source per slotKey; unique scoreKeys inside each source. */
export const assertUniqueScaleSources = (
  sources: BundleFrozenScaleSourceV1[],
): void => {
  const seenSlots = new Set<string>()
  for (const source of sources) {
    if (seenSlots.has(source.slotKey)) {
      bundleContractFail('SOURCE_SLOT_DUPLICATE', `重复 Scale slotKey: ${source.slotKey}`)
    }
    seenSlots.add(source.slotKey)
    const scoreKeys = new Set<string>()
    for (const score of source.scores) {
      if (scoreKeys.has(score.scoreKey)) {
        bundleContractFail(
          'SOURCE_SCORE_KEY_DUPLICATE',
          `Scale scoreKey 重复: ${source.slotKey}/${score.scoreKey}`,
        )
      }
      scoreKeys.add(score.scoreKey)
    }
  }
}

/** Fail-closed: valueSelectors within a slot must be unique. */
export const assertUniqueValueSelectors = (
  slots: Array<Pick<FrozenBundleSlotBindingV3, 'slotKey' | 'valueSelectors'> | {
    slotKey: string
    valueSelectors?: string[] | null
  }>,
): void => {
  for (const slot of slots) {
    const selectors = slot.valueSelectors ?? []
    const seen = new Set<string>()
    for (const selector of selectors) {
      if (seen.has(selector)) {
        bundleContractFail(
          'SOURCE_VALUE_SELECTOR_DUPLICATE',
          `valueSelector 重复: ${slot.slotKey}/${selector}`,
        )
      }
      seen.add(selector)
    }
  }
}

export const validateBundleEngineSourceSet = (input: {
  cognitiveSources?: BundleFrozenCognitiveSourceV1[]
  scaleSources?: BundleFrozenScaleSourceV1[]
  slots?: Array<Pick<FrozenBundleSlotBindingV3, 'slotKey' | 'valueSelectors'> | {
    slotKey: string
    valueSelectors?: string[] | null
  }>
}): void => {
  if (input.cognitiveSources) assertUniqueCognitiveSources(input.cognitiveSources)
  if (input.scaleSources) assertUniqueScaleSources(input.scaleSources)
  if (input.slots) assertUniqueValueSelectors(input.slots)
}
