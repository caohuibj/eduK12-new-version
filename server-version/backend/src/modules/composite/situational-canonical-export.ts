import { canonicalHash } from '../assessment-runtime/canonical'
import { parseFrozenActiveSlotSet, type FrozenActiveSlotSetV1 } from '../assessment-runtime/slot-set'
import { publicTemplatesForDatabase } from '../assessment-runtime/public-templates'
import { createHash } from 'node:crypto'
import type { AssessmentUnitSnapshot, Prisma } from '@prisma/client'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from '../assessment-runtime/unit-result'
import type { CompositeExportField } from './composite-export.service'
import { assertVerifiedTrainingAttemptScope, type TrainingAttemptScope } from './training-variant-scope'

export const SITUATIONAL_CANONICAL_EXPORT_VERSION = 'composite-sjt-canonical-summary-v2'

type ExportParent = {
  id: string; attemptEpoch: number; runtimeGeneration?: string | null;
  contextSnapshotHash?: string | null; frozenActiveSlotSetEncrypted?: string | null; frozenActiveSlotSetHash?: string | null;
}

/** Resolve all immutable shared plan references in one batch, never per parent.
 * These are accepted frozen slot plans, not live SJT authoring templates. */
export async function loadSituationalExportSlotSets(attempts: ReadonlyArray<ExportParent>, db?: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<Map<string, FrozenActiveSlotSetV1>> {
  const decoded = attempts.map(attempt => {
    if (attempt.runtimeGeneration !== 'UNIFIED_V1' || !attempt.frozenActiveSlotSetEncrypted || !attempt.frozenActiveSlotSetHash) throw new Error('SJT export frozen slots missing')
    const value = decryptUnifiedRuntimePayload<any>(attempt.frozenActiveSlotSetEncrypted)
    if (value?.k === 'FSP2' && (typeof value.p !== 'string' || !/^[a-f0-9]{64}$/.test(value.p)
      || !Number.isSafeInteger(value.e) || value.e < 1 || Object.keys(value).some(key => !['k', 'p', 'e'].includes(key)))) throw new Error('SJT export frozen slot reference invalid')
    return value
  })
  const hashes = [...new Set<string>(decoded.filter(value => value?.k === 'FSP2').map(value => value.p))]
  const plans = hashes.length ? await publicTemplatesForDatabase(db).loadMany(hashes.map(hash => ({ hash, kind: 'FROZEN_SLOT_PLAN' as const }))) : []
  const byHash = new Map(hashes.map((hash, index) => [hash, plans[index]]))
  return new Map(attempts.map((attempt, index) => {
    const value = decoded[index]
    const unsigned = value?.k === 'FSP2' ? { ...byHash.get(value.p), attemptEpoch: value.e } : null
    const frozen = parseFrozenActiveSlotSet(unsigned ? { ...unsigned, snapshotHash: canonicalHash(unsigned) } : value)
    if (frozen.attemptEpoch !== attempt.attemptEpoch || frozen.snapshotHash !== attempt.frozenActiveSlotSetHash) throw new Error('SJT export frozen parent binding mismatch')
    return [attempt.id, frozen]
  }))
}

/** Only accepted, current-epoch unit facts are inputs. No child/raw/template read
 * or rescoring is permitted, even when the enclosing export requests full detail. */
export function readSituationalExportResults(
  attempt: ExportParent & { compositeAssessment?: unknown },
  snapshots: ReadonlyArray<AssessmentUnitSnapshot>,
  frozen: FrozenActiveSlotSetV1,
  verifiedScope?: TrainingAttemptScope,
): Map<string, CanonicalUnitResultEnvelopeV1 | null> {
  if (frozen.attemptEpoch !== attempt.attemptEpoch) throw new Error('SJT export frozen epoch mismatch')
  const flow = verifiedScope?.flow
  if (flow) {
    assertVerifiedTrainingAttemptScope(attempt, attempt.compositeAssessment, verifiedScope!)
    if (frozen.snapshotHash !== attempt.frozenActiveSlotSetHash || frozen.snapshotHash !== flow.frozenSlots.snapshotHash) {
      throw new Error('SJT export flow slot binding mismatch')
    }
  }
  const slots = new Map(frozen.slots.filter(slot => slot.unitType === 'SITUATIONAL').map(slot => [slot.slotKey, slot]))
  const result = new Map<string, CanonicalUnitResultEnvelopeV1 | null>()
  for (const row of snapshots) {
    const slot = slots.get(row.slotKey)
    if (row.unitType !== 'SITUATIONAL') {
      if (slot) throw new Error('SJT export snapshot unit type mismatch')
      continue
    }
    if (!slot || !slot.runtimeIdentity) throw new Error('SJT export snapshot not in frozen slots')
    // An END/conditional skip has no FINAL. Never filter an injected row into
    // a seemingly legitimate missing value, even if its canonical body is valid.
    if (flow && (!flow.executedSlotKeys.has(row.slotKey) || !flow.reachedSlotKeys.has(row.slotKey))) {
      throw new Error('SJT export snapshot outside executed flow')
    }
    if (row.compositeAttemptId !== attempt.id || row.attemptEpoch !== attempt.attemptEpoch
      || !row.slotKey.startsWith('situational:') || result.has(row.slotKey)) throw new Error('SJT export snapshot identity mismatch')
    if (row.terminalState === 'SKIPPED' || row.terminalState === 'NOT_APPLICABLE') {
      if (slot.required || row.payloadKind !== 'NONE' || row.canonicalResultEncrypted || row.collectionFactsEncrypted) throw new Error('SJT export terminal payload mismatch')
      result.set(row.slotKey, null)
      continue
    }
    if (row.terminalState !== 'COMPLETED' || row.payloadKind !== 'UNIT_RESULT'
      || row.sourceType !== 'SITUATIONAL_ATTEMPT' || !row.sourceSubmissionId
      || !row.canonicalResultEncrypted || row.collectionFactsEncrypted) throw new Error('SJT export accepted canonical result missing')
    const envelope = parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(row.canonicalResultEncrypted))
    const { core, persistenceProvenance: source } = envelope
    const identity = slot.runtimeIdentity
    if (core.instrumentKey !== identity.instrumentKey || core.instrumentVersion !== identity.instrumentVersion
      || core.sourceDefinitionHash !== identity.definitionHash || core.compiledRuntimeHash !== identity.compiledRuntimeHash
      || core.scorerKey !== identity.scorerKey || core.scorerVersion !== identity.scoringVersion
      || core.unitType !== 'SITUATIONAL' || core.sourceDefinitionHash !== row.sourceDefinitionHash
      || core.compiledRuntimeHash !== row.compiledRuntimeHash || core.contextHash !== (attempt.contextSnapshotHash ?? null)
      || source.sourceType !== row.sourceType || source.sourceAttemptId !== row.sourceAttemptId
      || source.sourceSubmissionId !== row.sourceSubmissionId || envelope.completedAt !== row.completedAt.toISOString()) {
      throw new Error('SJT export canonical binding mismatch')
    }
    const keys = new Set<string>()
    for (const metric of core.metrics) {
      if (keys.has(metric.key) || (metric.value !== null && (typeof metric.value !== 'number' || !Number.isFinite(metric.value)))) throw new Error('SJT export metric contract mismatch')
      keys.add(metric.key)
    }
    result.set(row.slotKey, envelope)
  }
  for (const slot of slots.values()) if (slot.required && !result.has(slot.slotKey)) {
    // Only an explicit skip in the authenticated accepted path can relax the
    // required fact check. A current/reached unit with no snapshot still fails.
    if (flow?.skippedSlotKeys.has(slot.slotKey) && !flow.reachedSlotKeys.has(slot.slotKey) && !flow.executedSlotKeys.has(slot.slotKey)) {
      result.set(slot.slotKey, null)
    } else throw new Error('SJT export required snapshot missing')
  }
  return result
}

const metadata = [
  'instrument_key', 'instrument_version', 'compiler_version', 'scorer_key', 'scoring_version',
  'definition_hash', 'compiled_runtime_hash', 'result_hash', 'hash_scheme', 'context_snapshot_hash',
  'quality_status', 'quality_flags', 'terminal_state',
] as const

// Hash suffix prevents normalized-key collisions, including equal prefixes after truncation.
export const situationalSummaryFieldAllowed = (suffix: string): boolean => metadata.some(key => key === suffix) || /^M_[a-zA-Z0-9_]{0,30}_[a-f0-9]{16}(?:_q)?$/.test(suffix)

const metricName = (prefix: string, key: string) => `${prefix}M_${key.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${createHash('sha256').update(key).digest('hex').slice(0, 16)}`

export function situationalExportColumns(prefix: string, label: string, results: ReadonlyArray<CanonicalUnitResultEnvelopeV1 | null>) {
  const fields: CompositeExportField[] = metadata.map(key => ({ name: `${prefix}${key}`, label: `[${label}] ${key}`, type: 'string', width: key === 'quality_flags' ? 255 : 80 }))
  const metrics = new Map<string, { unit?: string }>()
  for (const result of results) for (const metric of result?.core.metrics ?? []) {
    const known = metrics.get(metric.key)
    if (known && known.unit !== metric.unit) throw new Error('SJT export metric units differ across accepted results')
    metrics.set(metric.key, { unit: metric.unit })
  }
  for (const key of [...metrics.keys()].sort()) {
    fields.push({ name: metricName(prefix, key), label: `[${label}] ${key}`, type: 'numeric', width: 12, decimals: 6, unit: metrics.get(key)?.unit ?? null, missingMeaning: 'Canonical null or no accepted result; never zero-filled' })
    fields.push({ name: `${metricName(prefix, key)}_q`, label: `[${label}] ${key} quality`, type: 'string', width: 80 })
  }
  return { fields, read(result: CanonicalUnitResultEnvelopeV1 | null, terminalState = result ? 'COMPLETED' : 'NOT_ACTIVE'): Record<string, unknown> {
    const row: Record<string, unknown> = Object.fromEntries(fields.map(field => [field.name, null]))
    row[`${prefix}terminal_state`] = terminalState
    if (!result) return row
    const core = result.core
    const values = [core.instrumentKey, core.instrumentVersion, core.compilerVersion, core.scorerKey, core.scorerVersion,
      core.sourceDefinitionHash, core.compiledRuntimeHash, result.resultHash, result.hashScheme, core.contextHash,
      core.quality.status, core.quality.flags.join('|'), terminalState]
    metadata.forEach((key, index) => { row[`${prefix}${key}`] = values[index] })
    for (const metric of core.metrics) {
      row[metricName(prefix, metric.key)] = metric.value
      row[`${metricName(prefix, metric.key)}_q`] = metric.quality ?? null
    }
    return row
  } }
}
