/**
 * Narrow frozen unit projections for Bundle engines.
 * Engines read these only — never raw trials/answers, never Prisma.
 * Deliberately smaller than CognitiveResultSnapshot / ScaleResultV2.
 *
 * sourceResultHash MUST be canonicalHash(validated ScaleResultV2 / CognitiveResultSnapshot).
 * envelope.resultHash (CanonicalUnitResultCore hash) is stored separately as envelopeResultHash.
 * Never dual-identity one field. Bare caller hashes are verified against the result hash only.
 */

import { canonicalHash } from '../assessment-runtime/canonical'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from '../assessment-runtime/unit-result'
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
  /** Always canonicalHash(validated CognitiveResultSnapshot). Never envelope.resultHash. */
  sourceResultHash: string
  /** Optional separate identity for CanonicalUnitResultEnvelope.resultHash (core hash). */
  envelopeResultHash: string | null
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
  /** Always canonicalHash(validated ScaleResultV2). Never envelope.resultHash. */
  sourceResultHash: string
  /** Optional separate identity for CanonicalUnitResultEnvelope.resultHash (core hash). */
  envelopeResultHash: string | null
  qualityState: BundleFrozenSourceQualityV1
  scores: BundleFrozenScaleScoreV1[]
}

/** Drop undefined keys so canonicalHash can hash ScaleResultV2 / Cognitive snapshots. */
const stripUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep)
  if (!value || typeof value !== 'object') return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue
    out[key] = stripUndefinedDeep(entry)
  }
  return out
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

const jsonEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (left === null || right === null) return left === right
  if (typeof left !== typeof right) return false
  if (typeof left !== 'object') return false
  // Numbers already handled by Object.is (incl. NaN). Compare via canonical JSON for nested values.
  try {
    return canonicalHash(left) === canonicalHash(right)
  } catch {
    return false
  }
}

/**
 * Prove a validated frozen result matches an envelope (same-instrument A+B rejection).
 * Compares quality + metrics/scores; does not dual-bind envelope.resultHash as sourceResultHash.
 */
const assertResultMatchesEnvelope = (input: {
  unitType: 'SCALE' | 'COGNITIVE'
  validatedResult: ScaleResultV2 | CognitiveResultSnapshot
  envelope: ReturnType<typeof parseCanonicalUnitResultEnvelope>
}): void => {
  const envelope = input.envelope
  if (input.unitType === 'SCALE') {
    const result = input.validatedResult as ScaleResultV2
    if (result.quality.status !== envelope.core.quality.status) {
      bundleContractFail(
        'SOURCE_RESULT_HASH_MISMATCH',
        `envelope quality 与 ScaleResult 不一致: envelope ${envelope.core.quality.status} vs result ${result.quality.status}`,
      )
    }
    const scoresByKey = new Map(result.scores.map((score) => [score.key, score]))
    for (const metric of envelope.core.metrics) {
      const score = scoresByKey.get(metric.key)
      if (!score) {
        bundleContractFail(
          'SOURCE_RESULT_HASH_MISMATCH',
          `envelope metric ${metric.key} 在 ScaleResult 中不存在（envelope A + result B）`,
        )
      } else {
        if (!jsonEqual(score.value, metric.value)) {
          bundleContractFail(
            'SOURCE_RESULT_HASH_MISMATCH',
            `envelope metric ${metric.key} 与 ScaleResult 值不匹配（envelope A + result B）`,
          )
        }
        if (metric.quality !== undefined && metric.quality !== score.status) {
          bundleContractFail(
            'SOURCE_RESULT_HASH_MISMATCH',
            `envelope metric ${metric.key} quality 与 ScaleResult status 不匹配`,
          )
        }
      }
    }
    return
  }

  const snapshot = input.validatedResult as CognitiveResultSnapshot
  if (snapshot.quality.state !== envelope.core.quality.status) {
    bundleContractFail(
      'SOURCE_RESULT_HASH_MISMATCH',
      `envelope quality 与 CognitiveResult 不一致: envelope ${envelope.core.quality.status} vs result ${snapshot.quality.state}`,
    )
  }
  for (const metric of envelope.core.metrics) {
    if (!(metric.key in snapshot.metrics)) {
      bundleContractFail(
        'SOURCE_RESULT_HASH_MISMATCH',
        `envelope metric ${metric.key} 在 CognitiveResult 中不存在（envelope A + result B）`,
      )
    }
    if (!jsonEqual(snapshot.metrics[metric.key], metric.value)) {
      bundleContractFail(
        'SOURCE_RESULT_HASH_MISMATCH',
        `envelope metric ${metric.key} 与 CognitiveResult 值不匹配（envelope A + result B）`,
      )
    }
  }
}

/**
 * Bind sourceResultHash from the validated frozen result only.
 * sourceResultHash := canonicalHash(ScaleResultV2 | CognitiveResultSnapshot).
 * envelope.resultHash (hash of CanonicalUnitResultCore) is a separate field — never dual-identity.
 */
const bindAuthoritativeSourceResultHashes = (input: {
  unitType: 'SCALE' | 'COGNITIVE'
  instrumentKey: string
  instrumentVersion: string
  validatedResult: ScaleResultV2 | CognitiveResultSnapshot
  claimedHash?: string
  canonicalEnvelope?: unknown
}): { sourceResultHash: string; envelopeResultHash: string | null } => {
  const sourceResultHash = canonicalHash(stripUndefinedDeep(input.validatedResult))

  if (input.claimedHash !== undefined) {
    if (typeof input.claimedHash !== 'string' || !HEX_HASH.test(input.claimedHash)) {
      bundleContractFail(
        'SOURCE_RESULT_HASH',
        'sourceResultHash 必须是小写 SHA-256（64 hex），且由权威冻结结果绑定',
      )
    }
    if (input.claimedHash !== sourceResultHash) {
      bundleContractFail(
        'SOURCE_RESULT_HASH_MISMATCH',
        'sourceResultHash 不属于该权威结果（可能属于另一结果）',
      )
    }
  }

  if (input.canonicalEnvelope === undefined) {
    return { sourceResultHash, envelopeResultHash: null }
  }

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
  assertResultMatchesEnvelope({
    unitType: input.unitType,
    validatedResult: input.validatedResult,
    envelope,
  })
  return { sourceResultHash, envelopeResultHash: envelope.resultHash }
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

  const hashes = bindAuthoritativeSourceResultHashes({
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
    sourceResultHash: hashes.sourceResultHash,
    envelopeResultHash: hashes.envelopeResultHash,
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

  const hashes = bindAuthoritativeSourceResultHashes({
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
    sourceResultHash: hashes.sourceResultHash,
    envelopeResultHash: hashes.envelopeResultHash,
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


/**
 * Build Bundle scale source from Canonical envelope.bundleBridge only.
 * Bundle v3 must not reread Assessment.result or live definition graphs.
 */
export const projectBundleScaleSourceFromCanonicalBridge = (input: {
  slotKey: string
  expectedInstrumentKey: string
  expectedInstrumentVersion: string
  envelope: CanonicalUnitResultEnvelopeV1
}): BundleFrozenScaleSourceV1 => {
  const bridge = input.envelope.bundleBridge
  if (!bridge?.scores) {
    return bundleContractFail('SOURCE_IDENTITY_MISMATCH', `Canonical envelope 缺少 Scale bundleBridge：${input.slotKey}`)
  }
  assertInstrumentIdentity({
    expectedInstrumentKey: input.expectedInstrumentKey,
    expectedInstrumentVersion: input.expectedInstrumentVersion,
    actualKey: input.envelope.core.instrumentKey,
    actualVersion: input.envelope.core.instrumentVersion,
    label: 'Scale',
  })
  return {
    slotKey: input.slotKey,
    instrumentKey: input.envelope.core.instrumentKey,
    instrumentVersion: input.envelope.core.instrumentVersion,
    sourceResultHash: bridge.sourceResultHash,
    envelopeResultHash: input.envelope.resultHash,
    qualityState: input.envelope.core.quality.status,
    scores: bridge.scores.map((score) => ({ ...score })),
  }
}

export const projectBundleCognitiveSourceFromCanonicalBridge = (input: {
  slotKey: string
  expectedInstrumentKey: string
  expectedInstrumentVersion: string
  envelope: CanonicalUnitResultEnvelopeV1
}): BundleFrozenCognitiveSourceV1 => {
  const bridge = input.envelope.bundleBridge
  if (!bridge || bridge.metrics === undefined || typeof bridge.hasReferenceNorms !== 'boolean') {
    return bundleContractFail('SOURCE_IDENTITY_MISMATCH', `Canonical envelope 缺少 Cognitive bundleBridge：${input.slotKey}`)
  }
  assertInstrumentIdentity({
    expectedInstrumentKey: input.expectedInstrumentKey,
    expectedInstrumentVersion: input.expectedInstrumentVersion,
    actualKey: input.envelope.core.instrumentKey,
    actualVersion: input.envelope.core.instrumentVersion,
    label: 'Cognitive',
  })
  return {
    slotKey: input.slotKey,
    instrumentKey: input.envelope.core.instrumentKey,
    instrumentVersion: input.envelope.core.instrumentVersion,
    sourceResultHash: bridge.sourceResultHash,
    envelopeResultHash: input.envelope.resultHash,
    metrics: { ...bridge.metrics },
    qualityState: input.envelope.core.quality.status,
    hasReferenceNorms: bridge.hasReferenceNorms,
  }
}

/** Capture Scale Bundle bridge fields while ScaleResultV2 is still in memory. */
export const buildScaleBundleBridge = (result: ScaleResultV2): NonNullable<CanonicalUnitResultEnvelopeV1['bundleBridge']> => {
  const projected = projectBundleScaleSource({
    slotKey: '_bridge',
    expectedInstrumentKey: result.instrument.code,
    expectedInstrumentVersion: result.instrument.instrumentVersion,
    result,
  })
  return {
    sourceResultHash: projected.sourceResultHash,
    scores: projected.scores,
  }
}

/** Capture Cognitive Bundle bridge fields while CognitiveResultSnapshot is still in memory. */
export const buildCognitiveBundleBridge = (
  snapshot: CognitiveResultSnapshot,
): NonNullable<CanonicalUnitResultEnvelopeV1['bundleBridge']> => {
  const projected = projectBundleCognitiveSource({
    slotKey: '_bridge',
    expectedInstrumentKey: snapshot.testType,
    expectedInstrumentVersion: snapshot.configVersion,
    result: snapshot,
  })
  return {
    sourceResultHash: projected.sourceResultHash,
    metrics: projected.metrics,
    hasReferenceNorms: projected.hasReferenceNorms,
  }
}
