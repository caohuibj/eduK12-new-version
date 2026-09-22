import { hashMentalHealthRuleSet, type MentalHealthRuleSetV1 } from '../assessment-bundle/engines/mental-health-rule-v1'
import { randomUUID } from 'node:crypto'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  buildFrozenAssessmentBundleSnapshot,
  compileBundleRuntimeFromFrozenRead,
  createProductBundleAnalysisEngineRegistry,
  hashBundleContextDefinition,
  projectBundleReportFacts,
  validateAssessmentBundleDefinition,
  validateBundleContextDefinition,
  validateBundleContextFacts,
  type AssessmentBundleDefinitionV1,
  type BundleAnalysisEngineRegistry,
  type BundleContextDefinitionV1,
  type FrozenAssessmentBundleSnapshotV3,
} from '../assessment-bundle'
import { reanalysisFail } from './errors'
import type {
  BundleReanalysisHistoryEntryV1,
  BundleReanalysisRequestV1,
  BundleReanalysisResultV1,
} from './types'

const EXACT = /^[0-9]+\.[0-9]+\.[0-9]+$/
const HEX = /^[0-9a-f]{64}$/

export const validateReanalysisRequest = (
  value: BundleReanalysisRequestV1 | unknown,
): BundleReanalysisRequestV1 => {
  const req = value as BundleReanalysisRequestV1
  if (!req || req.schemaVersion !== 1) reanalysisFail('REANALYSIS_INPUT', 'schemaVersion must be 1')
  if (!req.targetBundleKey?.trim()) reanalysisFail('REANALYSIS_TARGET', 'targetBundleKey required')
  if (!EXACT.test(req.targetBundleVersion)) {
    reanalysisFail('REANALYSIS_TARGET', 'targetBundleVersion must be exact x.y.z')
  }
  if (!Array.isArray(req.frozenCognitiveSources) || !Array.isArray(req.frozenScaleSources)) {
    reanalysisFail('REANALYSIS_SOURCE', 'frozen unit sources required')
  }
  if (req.frozenSituationalSources !== undefined && !Array.isArray(req.frozenSituationalSources)) {
    reanalysisFail('REANALYSIS_SOURCE', 'frozen Situational sources must be an array')
  }
  assertNoRawReanalysisInput(req as BundleReanalysisRequestV1 & { rawAnswers?: unknown; rawTrials?: unknown })
  if (!req.actorUserId?.trim()) reanalysisFail('REANALYSIS_INPUT', 'actorUserId required')
  if (req.aggregateInputHash != null && !HEX.test(req.aggregateInputHash)) {
    reanalysisFail('REANALYSIS_INPUT', 'aggregateInputHash must be 64 hex or null')
  }
  return req
}

/**
 * Recompute reanalysis provenance from frozen sources + context + compiled runtime.
 * Caller-supplied aggregateInputHash must match when provided.
 */
export const computeReanalysisAggregateInputHash = (input: {
  snapshotHash: string
  compiledBundleRuntimeHash: string
  cognitiveSources: Array<{ slotKey: string; sourceResultHash: string }>
  scaleSources: Array<{ slotKey: string; sourceResultHash: string }>
  situationalSources?: Array<{ slotKey: string; sourceResultHash: string }>
  contextSnapshotHash: string | null
}): string => canonicalHash({
  hashScheme: 'bundle-reanalysis-aggregate-v1',
  snapshotHash: input.snapshotHash,
  compiledBundleRuntimeHash: input.compiledBundleRuntimeHash,
  contextSnapshotHash: input.contextSnapshotHash,
  sources: [
    ...input.cognitiveSources.map((row) => ({
      unitType: 'COGNITIVE' as const,
      slotKey: row.slotKey,
      sourceResultHash: row.sourceResultHash,
    })),
    ...input.scaleSources.map((row) => ({
      unitType: 'SCALE' as const,
      slotKey: row.slotKey,
      sourceResultHash: row.sourceResultHash,
    })),
    ...(input.situationalSources ?? []).map((row) => ({
      unitType: 'SITUATIONAL' as const,
      slotKey: row.slotKey,
      sourceResultHash: row.sourceResultHash,
    })),
  ].sort((a, b) => (
    a.slotKey < b.slotKey ? -1 : a.slotKey > b.slotKey ? 1 : a.unitType < b.unitType ? -1 : a.unitType > b.unitType ? 1 : 0
  )),
})

const matchUniqueSlotSource = <T extends {
  slotKey: string
  instrumentKey: string
  instrumentVersion: string
}>(input: {
  slotKey: string
  instrumentKey: string
  instrumentVersion: string
  unitType: 'COGNITIVE' | 'SCALE' | 'SITUATIONAL'
  sources: T[]
}): { ok: true; source: T } | { ok: false; reason: BundleReanalysisResultV1 & { ok: false } } => {
  const matches = input.sources.filter((row) => row.slotKey === input.slotKey)
  if (matches.length === 0) {
    return {
      ok: false,
      reason: {
        ok: false,
        reason: 'MISSING_REQUIRED_SOURCE',
        message: `missing frozen ${input.unitType} source for slot ${input.slotKey}`,
      },
    }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: {
        ok: false,
        reason: 'DUPLICATE_SOURCE_SLOT',
        message: `duplicate frozen ${input.unitType} sources for slot ${input.slotKey}`,
      },
    }
  }
  const source = matches[0]!
  if (
    source.instrumentKey !== input.instrumentKey
    || source.instrumentVersion !== input.instrumentVersion
  ) {
    return {
      ok: false,
      reason: {
        ok: false,
        reason: 'INCOMPATIBLE_SOURCE_VERSION',
        message: `${input.unitType.toLowerCase()} slot ${input.slotKey} frozen ${source.instrumentKey}@${source.instrumentVersion} incompatible with target ${input.instrumentKey}@${input.instrumentVersion}`,
      },
    }
  }
  return { ok: true, source }
}

/**
 * Explicit Bundle reanalysis by { targetBundleKey, targetBundleVersion }.
 * - Require ALL COGNITIVE/SCALE/SITUATIONAL slots have unique matching frozen sources
 * - Context key/version/hash must match via hashBundleContextDefinition
 * - Build engine input from frozen sources + context → dispatch registry
 * - Regenerate BundleReportFacts; always emit a new history entry (never overwrite)
 * - safetyTriggered ⇒ openNewSafetyCase (caller creates new case; never auto-close old)
 * - No raw answer/trial reads
 */
export const runExplicitBundleReanalysis = (input: {
  request: BundleReanalysisRequestV1
  /** Catalog lookup for the exact target key@version. */
  resolveTargetDefinition: (
    bundleKey: string,
    bundleVersion: string,
  ) => AssessmentBundleDefinitionV1 | null
  /** Required when target declares Context. */
  resolveContextDefinition?: (
    contextDefinitionKey: string,
    contextDefinitionVersion: string,
  ) => BundleContextDefinitionV1 | null
  ruleSet?: MentalHealthRuleSetV1 | null
  priorSnapshot?: FrozenAssessmentBundleSnapshotV3 | null
  /** Optional registry override (tests); defaults to product registry. */
  registry?: BundleAnalysisEngineRegistry
  /** Whether the newly projected analysis would open safety (test fixture / signal). */
  safetyTriggered?: boolean
  now?: string
}): BundleReanalysisResultV1 => {
  const request = validateReanalysisRequest(input.request)
  const definition = input.resolveTargetDefinition(
    request.targetBundleKey,
    request.targetBundleVersion,
  )
  if (!definition) {
    return {
      ok: false,
      reason: 'TARGET_BUNDLE_UNKNOWN',
      message: `unknown target Bundle ${request.targetBundleKey}@${request.targetBundleVersion}`,
    }
  }
  if (
    definition.bundleKey !== request.targetBundleKey
    || definition.bundleVersion !== request.targetBundleVersion
  ) {
    return {
      ok: false,
      reason: 'TARGET_VERSION_UNKNOWN',
      message: 'resolved definition does not match target key@version',
    }
  }

  const validated = validateAssessmentBundleDefinition(definition)
  const cognitiveSlots = validated.slots.filter((slot) => slot.unitType === 'COGNITIVE')
  const scaleSlots = validated.slots.filter((slot) => slot.unitType === 'SCALE')
  const situationalSlots = validated.slots.filter((slot) => slot.unitType === 'SITUATIONAL')

  // Reject unknown / extra source slots not declared by the target Bundle.
  const declaredCognitive = new Set(cognitiveSlots.map((slot) => slot.slotKey))
  const declaredScale = new Set(scaleSlots.map((slot) => slot.slotKey))
  const declaredSituational = new Set(situationalSlots.map((slot) => slot.slotKey))
  for (const source of request.frozenSituationalSources ?? []) {
    if (!declaredSituational.has(source.slotKey)) return { ok: false, reason: 'UNKNOWN_SOURCE_SLOT', message: 'unknown Situational source slot ' + source.slotKey }
  }
  for (const source of request.frozenCognitiveSources) {
    if (!declaredCognitive.has(source.slotKey)) {
      return {
        ok: false,
        reason: 'UNKNOWN_SOURCE_SLOT',
        message: `unknown cognitive source slot ${source.slotKey}`,
      }
    }
  }
  for (const source of request.frozenScaleSources) {
    if (!declaredScale.has(source.slotKey)) {
      return {
        ok: false,
        reason: 'UNKNOWN_SOURCE_SLOT',
        message: `unknown scale source slot ${source.slotKey}`,
      }
    }
  }

  const matchedCognitive = []
  for (const slot of cognitiveSlots) {
    const matched = matchUniqueSlotSource({
      slotKey: slot.slotKey,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      unitType: 'COGNITIVE',
      sources: request.frozenCognitiveSources,
    })
    if (!matched.ok) return matched.reason
    matchedCognitive.push(matched.source)
  }

  const matchedScale = []
  for (const slot of scaleSlots) {
    const matched = matchUniqueSlotSource({
      slotKey: slot.slotKey,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      unitType: 'SCALE',
      sources: request.frozenScaleSources,
    })
    if (!matched.ok) return matched.reason
    matchedScale.push(matched.source)
  }

  const matchedSituational = []
  for (const slot of situationalSlots) {
    const matched = matchUniqueSlotSource({
      slotKey: slot.slotKey, instrumentKey: slot.instrumentKey, instrumentVersion: slot.instrumentVersion,
      unitType: 'SITUATIONAL', sources: request.frozenSituationalSources ?? [],
    })
    if (!matched.ok) return matched.reason
    matchedSituational.push(matched.source)
  }

  let contextDefinition: BundleContextDefinitionV1 | null = null
  let contextFacts = null as ReturnType<typeof validateBundleContextFacts> | null
  if (validated.contextDefinitionKey && validated.contextDefinitionVersion) {
    if (!request.frozenContextFacts) {
      return {
        ok: false,
        reason: 'MISSING_REQUIRED_CONTEXT',
        message: `target ${validated.bundleKey}@${validated.bundleVersion} requires Context ${validated.contextDefinitionKey}@${validated.contextDefinitionVersion}`,
      }
    }
    const facts = validateBundleContextFacts(request.frozenContextFacts)
    if (
      facts.contextDefinitionKey !== validated.contextDefinitionKey
      || facts.contextDefinitionVersion !== validated.contextDefinitionVersion
    ) {
      return {
        ok: false,
        reason: 'CONTEXT_DEFINITION_MISMATCH',
        message: 'frozen Context definition key/version does not match target Bundle declaration',
      }
    }
    const resolved = input.resolveContextDefinition?.(
      validated.contextDefinitionKey,
      validated.contextDefinitionVersion,
    ) ?? null
    if (!resolved) {
      return {
        ok: false,
        reason: 'MISSING_REQUIRED_CONTEXT',
        message: 'ContextDefinition not available for target Bundle',
      }
    }
    const validatedContext = validateBundleContextDefinition(resolved)
    // key/version/hash must all match — definition-only freeze is NOT enough.
    const expectedHash = hashBundleContextDefinition(validatedContext)
    if (facts.contextDefinitionHash !== expectedHash) {
      return {
        ok: false,
        reason: 'CONTEXT_DEFINITION_MISMATCH',
        message: 'frozen Context definition hash does not match resolved ContextDefinition (same version, different hash)',
      }
    }
    if (
      validatedContext.contextDefinitionKey !== facts.contextDefinitionKey
      || validatedContext.contextDefinitionVersion !== facts.contextDefinitionVersion
    ) {
      return {
        ok: false,
        reason: 'CONTEXT_DEFINITION_MISMATCH',
        message: 'resolved ContextDefinition key/version does not match frozen facts',
      }
    }
    contextDefinition = validatedContext
    contextFacts = facts
  }

  const newSnapshot = buildFrozenAssessmentBundleSnapshot(
    validated,
    { contextDefinition, ruleSetRef: input.ruleSet ? { key: input.ruleSet.ruleSetKey, version: input.ruleSet.ruleSetVersion, hash: hashMentalHealthRuleSet(input.ruleSet) } : null },
  )

  const compiledRuntime = compileBundleRuntimeFromFrozenRead({
    family: 'ASSESSMENT_BUNDLE',
    snapshotVersion: 3,
    snapshot: newSnapshot,
  })

  const recomputedAggregateHash = computeReanalysisAggregateInputHash({
    snapshotHash: newSnapshot.snapshotHash,
    compiledBundleRuntimeHash: compiledRuntime.compiledRuntimeHash,
    cognitiveSources: matchedCognitive,
    scaleSources: matchedScale,
    situationalSources: matchedSituational,
    contextSnapshotHash: contextFacts?.contextSnapshotHash ?? null,
  })

  if (request.aggregateInputHash != null && request.aggregateInputHash !== recomputedAggregateHash) {
    return {
      ok: false,
      reason: 'AGGREGATE_INPUT_HASH_MISMATCH',
      message: 'request.aggregateInputHash does not match recomputed reanalysis provenance',
    }
  }

  const registry = input.registry ?? createProductBundleAnalysisEngineRegistry()
  const engineInput = {
    snapshot: newSnapshot,
    compiledRuntime,
    evidence: [] as never[],
    contextFacts,
    aggregateInputHash: recomputedAggregateHash,
    cognitiveSources: matchedCognitive,
    scaleSources: matchedScale,
    situationalSources: matchedSituational,
    ruleSet: input.ruleSet,
  }
  const reportFacts = projectBundleReportFacts({
    registry,
    engineInput,
  })
  const engineResult = reportFacts.enginePayload.kind === 'COMPUTED'
    ? { kind: 'COMPUTED' as const, payload: reportFacts.enginePayload.payload }
    : { kind: 'UNAVAILABLE' as const, reason: reportFacts.enginePayload.reason }

  const now = input.now ?? new Date().toISOString()
  const analysisInstanceId = request.analysisInstanceId?.trim() || randomUUID()
  const history: BundleReanalysisHistoryEntryV1 = {
    historyId: randomUUID(),
    createdAt: now,
    actorUserId: request.actorUserId,
    targetBundleKey: request.targetBundleKey,
    targetBundleVersion: request.targetBundleVersion,
    priorSnapshotHash: input.priorSnapshot?.snapshotHash ?? null,
    newSnapshotHash: newSnapshot.snapshotHash,
    reportFactsHash: canonicalHash({
      identity: reportFacts.identity,
      provenance: reportFacts.provenance,
      enginePayload: reportFacts.enginePayload,
      quality: reportFacts.quality,
    }),
    aggregateInputHash: recomputedAggregateHash,
    analysisInstanceId,
  }

  const safetyTriggered = input.safetyTriggered === true
  return {
    ok: true,
    request: {
      ...request,
      aggregateInputHash: recomputedAggregateHash,
      analysisInstanceId,
    },
    newSnapshot,
    priorSnapshotHash: input.priorSnapshot?.snapshotHash ?? null,
    reportFacts,
    engineResult,
    aggregateInputHash: recomputedAggregateHash,
    history,
    safetyTriggered,
    openNewSafetyCase: safetyTriggered,
  }
}

/** Guard: reanalysis APIs must never accept raw answers/trials. */
export const assertNoRawReanalysisInput = (input: {
  rawAnswers?: unknown
  rawTrials?: unknown
}): void => {
  if (input.rawAnswers !== undefined && input.rawAnswers !== null) {
    reanalysisFail('REANALYSIS_FORBIDDEN', 'reanalysis must not read raw answers')
  }
  if (input.rawTrials !== undefined && input.rawTrials !== null) {
    reanalysisFail('REANALYSIS_FORBIDDEN', 'reanalysis must not read raw trials')
  }
}
