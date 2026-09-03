import {
  buildFrozenAssessmentBundleSnapshot,
  validateAssessmentBundleDefinition,
  validateBundleContextFacts,
  type AssessmentBundleDefinitionV1,
  type BundleContextDefinitionV1,
  type FrozenAssessmentBundleSnapshotV3,
} from '../assessment-bundle'
import { reanalysisFail } from './errors'
import type { BundleReanalysisRequestV1, BundleReanalysisResultV1 } from './types'

const EXACT = /^[0-9]+\.[0-9]+\.[0-9]+$/

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
  if (!req.actorUserId?.trim()) reanalysisFail('REANALYSIS_INPUT', 'actorUserId required')
  return req
}

/**
 * Explicit Bundle reanalysis by { targetBundleKey, targetBundleVersion }.
 * - Reuses original frozen unit results + Context only
 * - Missing required Context → reject
 * - Always new snapshot; never overwrite old
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
  priorSnapshot?: FrozenAssessmentBundleSnapshotV3 | null
  /** Whether the newly projected analysis would open safety (test fixture / signal). */
  safetyTriggered?: boolean
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

  // Target version must declare compatible source versions with frozen units.
  for (const slot of validated.slots) {
    if (slot.unitType === 'COGNITIVE') {
      const source = request.frozenCognitiveSources.find((row) => row.slotKey === slot.slotKey)
      if (!source) continue
      if (
        source.instrumentKey !== slot.instrumentKey
        || source.instrumentVersion !== slot.instrumentVersion
      ) {
        return {
          ok: false,
          reason: 'INCOMPATIBLE_SOURCE_VERSION',
          message: `cognitive slot ${slot.slotKey} frozen ${source.instrumentKey}@${source.instrumentVersion} incompatible with target ${slot.instrumentKey}@${slot.instrumentVersion}`,
        }
      }
    }
    if (slot.unitType === 'SCALE') {
      const source = request.frozenScaleSources.find((row) => row.slotKey === slot.slotKey)
      if (!source) continue
      if (
        source.instrumentKey !== slot.instrumentKey
        || source.instrumentVersion !== slot.instrumentVersion
      ) {
        return {
          ok: false,
          reason: 'INCOMPATIBLE_SOURCE_VERSION',
          message: `scale slot ${slot.slotKey} frozen ${source.instrumentKey}@${source.instrumentVersion} incompatible with target ${slot.instrumentKey}@${slot.instrumentVersion}`,
        }
      }
    }
  }

  let contextDefinition: BundleContextDefinitionV1 | null | undefined
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
    contextDefinition = input.resolveContextDefinition?.(
      validated.contextDefinitionKey,
      validated.contextDefinitionVersion,
    ) ?? null
    if (!contextDefinition) {
      return {
        ok: false,
        reason: 'MISSING_REQUIRED_CONTEXT',
        message: 'ContextDefinition not available for target Bundle',
      }
    }
  }

  const newSnapshot = buildFrozenAssessmentBundleSnapshot(
    validated,
    contextDefinition ? { contextDefinition } : undefined,
  )

  if (input.priorSnapshot && newSnapshot.snapshotHash === input.priorSnapshot.snapshotHash) {
    // Same definition hash is possible if target equals prior; still return a new object.
    // Callers must persist as a new analysis row — never overwrite.
  }

  const safetyTriggered = input.safetyTriggered === true
  return {
    ok: true,
    request,
    newSnapshot,
    priorSnapshotHash: input.priorSnapshot?.snapshotHash ?? null,
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
