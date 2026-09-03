/**
 * Narrow frozen unit projections for Bundle engines.
 * Engines read these only — never raw trials/answers, never Prisma.
 * Deliberately smaller than CognitiveResultSnapshot / ScaleResultV2.
 *
 * sourceResultHash MUST come from validated authoritative persistence:
 * - preferred: parseCanonicalUnitResultEnvelope → envelope.resultHash
 * - otherwise: canonicalHash(validated result) (same CANONICAL_JSON_SHA256_V1)
 * Bare caller hashes are never trusted without verification against the result.
 */

import { canonicalHash } from '../assessment-runtime/canonical'
import { parseCanonicalUnitResultEnvelope } from '../assessment-runtime/unit-result'
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

/**
 * Bind sourceResultHash from authoritative persistence.
 * Prefer a validated CanonicalUnitResultEnvelope; otherwise recompute via
 * canonicalHash(validatedResult) — the same V3.2 algorithm, never a second hash scheme.
 */
const bindAuthoritativeSourceResultHash = (input: {
  unitType: 'SCALE' | 'COGNITIVE'
  instrumentKey: string
  instrumentVersion: string
  validatedResult: unknown
  claimedHash?: string
  canonicalEnvelope?: unknown
}): string => {
  if (input.canonicalEnvelope !== undefined) {
    let envelope
    try {
      envelope = parseCanonicalUnitResultEnvelope(input.canonicalEnvelope)
    } catch (error) {
      return bundleContractFail(
        'SOURCE_RESULT_HASH',
        `CanonicalUnitResultEnvelope 无效: ${error instanceof Error ? error.message : 'parse failed'}`,
      )
    }
    if (envelope.core.unitType !== input.unitType) {
      bundleContractFail(
        'SOURCE_RESULT_HASH',
        `envelope unitType 必须是 ${input.unitType}，got ${envelope.core.unitType}`,
      )
    }
    if (
      envelope.core.instrumentKey !== input.instrumentKey
      || envelope.core.instrumentVersion !== input.instrumentVersion
    ) {
      bundleContractFail(
        'SOURCE_RESULT_HASH_MISMATCH',
        `envelope identity 与结果不匹配: envelope ${envelope.core.instrumentKey}@${envelope.core.instrumentVersion} vs result ${input.instrumentKey}@${input.instrumentVersion}`,
      )
    }
    if (input.claimedHash !== undefined && input.claimedHash !== envelope.resultHash) {
      bundleContractFail(
        'SOURCE_RESULT_HASH_MISMATCH',
        'caller sourceResultHash 与 CanonicalUnitResultEnvelope.resultHash 不一致',
      )
    }
    return envelope.resultHash
  }

  const computed = canonicalHash(input.validatedResult)
  if (input.claimedHash !== undefined) {
    if (typeof input.claimedHash !== 'string' || !HEX_HASH.test(input.claimedHash)) {
      bundleContractFail(
        'SOURCE_RESULT_HASH',
        'sourceResultHash 必须是小写 SHA-256（64 hex），且由权威冻结结果绑定',
      )
    }
    if (input.claimedHash !== computed) {
      bundleContractFail(
        'SOURCE_RESULT_HASH_MISMATCH',
        'sourceResultHash 不属于该权威结果（可能属于另一结果）',
      )
    }
  }
  return computed
}

const hasUsableCognitiveReferenceNorms = (snapshot: CognitiveResultSnapshot): boolean => {
  if (snapshot.quality.state === 'invalid') return false
  return snapshot.references.some((entry) => {
    if (!isRecord(entry)) return false
    if (entry.status !== 'available') return false
    if (entry.referenceKind !== 'normative_distribution') return false
    return true
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
    return (
      candidate.scoreKey === scoreKey
      && candidate.status === 'available'
      && candidate.referenceKind === 'criterion_threshold'
    )
  })
  if (!reference || !isRecord(reference)) return null
  const band = isRecord(reference.criterionBand) ? reference.criterionBand : null
  if (!band || typeof band.key !== 'string' || band.key.length === 0) return null
  return band.key
}

/**
 * Project a validated CognitiveResultSnapshot into the narrow Bundle source.
 * hasReferenceNorms requires available + referenceKind === 'normative_distribution'.
 */
export const projectBundleCognitiveSource = (input: {
  slotKey: string
  expectedInstrumentKey: string
  expectedInstrumentVersion: string
  result: unknown
  /** Optional claimed hash — must match authoritative binding when provided. */
  sourceResultHash?: string
  /** Preferred: validated CanonicalUnitResultEnvelope (resultHash taken from it). */
  canonicalEnvelope?: unknown
}): BundleFrozenCognitiveSourceV1 => {
  const snapshot = parseCognitiveResultSnapshot(input.result)
  assertInstrumentIdentity({
    expectedInstrumentKey: input.expectedInstrumentKey,
    expectedInstrumentVersion: input.expectedInstrumentVersion,
    actualKey: snapshot.testType,
    actualVersion: snapshot.configVersion,
    label: 'Cognitive',
  })

  const sourceResultHash = bindAuthoritativeSourceResultHash({
    unitType: 'COGNITIVE',
    instrumentKey: snapshot.testType,
    instrumentVersion: snapshot.configVersion,
    validatedResult: snapshot,
    claimedHash: input.sourceResultHash,
    canonicalEnvelope: input.canonicalEnvelope,
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
 * Criterion bands require available + referenceKind === 'criterion_threshold'.
 */
export const projectBundleScaleSource = (input: {
  slotKey: string
  expectedInstrumentKey: string
  expectedInstrumentVersion: string
  result: unknown
  /** Optional claimed hash — must match authoritative binding when provided. */
  sourceResultHash?: string
  /** Preferred: validated CanonicalUnitResultEnvelope (resultHash taken from it). */
  canonicalEnvelope?: unknown
}): BundleFrozenScaleSourceV1 => {
  const result = parseScaleResultV2(input.result)
  assertInstrumentIdentity({
    expectedInstrumentKey: input.expectedInstrumentKey,
    expectedInstrumentVersion: input.expectedInstrumentVersion,
    actualKey: result.instrument.code,
    actualVersion: result.instrument.instrumentVersion,
    label: 'Scale',
  })

  const sourceResultHash = bindAuthoritativeSourceResultHash({
    unitType: 'SCALE',
    instrumentKey: result.instrument.code,
    instrumentVersion: result.instrument.instrumentVersion,
    validatedResult: result,
    claimedHash: input.sourceResultHash,
    canonicalEnvelope: input.canonicalEnvelope,
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
