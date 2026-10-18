import { createHash } from 'node:crypto'
import type { AssessmentUnitSnapshot } from '@prisma/client'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from '../assessment-runtime/unit-result'
import type { CompositeExportField } from './composite-export.service'

export const SITUATIONAL_CANONICAL_EXPORT_VERSION = 'composite-sjt-canonical-summary-v1'

/** Only accepted, current-epoch unit facts are inputs. No child/raw/template read
 * or rescoring is permitted, even when the enclosing export requests full detail. */
export function readSituationalExportResults(
  attempt: { id: string; attemptEpoch: number; contextSnapshotHash?: string | null },
  snapshots: ReadonlyArray<AssessmentUnitSnapshot>,
): Map<string, CanonicalUnitResultEnvelopeV1 | null> {
  const result = new Map<string, CanonicalUnitResultEnvelopeV1 | null>()
  for (const row of snapshots) {
    if (row.unitType !== 'SITUATIONAL') continue
    if (row.compositeAttemptId !== attempt.id || row.attemptEpoch !== attempt.attemptEpoch
      || !row.slotKey.startsWith('situational:') || result.has(row.slotKey)) throw new Error('SJT export snapshot identity mismatch')
    if (row.terminalState === 'SKIPPED' || row.terminalState === 'NOT_APPLICABLE') {
      if (row.payloadKind !== 'NONE' || row.canonicalResultEncrypted || row.collectionFactsEncrypted) throw new Error('SJT export terminal payload mismatch')
      result.set(row.slotKey, null)
      continue
    }
    if (row.terminalState !== 'COMPLETED' || row.payloadKind !== 'UNIT_RESULT'
      || row.sourceType !== 'SITUATIONAL_ATTEMPT' || !row.sourceSubmissionId
      || !row.canonicalResultEncrypted || row.collectionFactsEncrypted) throw new Error('SJT export accepted canonical result missing')
    const envelope = parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(row.canonicalResultEncrypted))
    const { core, persistenceProvenance: source } = envelope
    if (core.unitType !== 'SITUATIONAL' || core.sourceDefinitionHash !== row.sourceDefinitionHash
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
  return result
}

const metadata = [
  'instrument_key', 'instrument_version', 'compiler_version', 'scorer_key', 'scoring_version',
  'definition_hash', 'compiled_runtime_hash', 'result_hash', 'hash_scheme', 'context_snapshot_hash',
  'quality_status', 'quality_flags',
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
  return { fields, read(result: CanonicalUnitResultEnvelopeV1 | null): Record<string, unknown> {
    const row: Record<string, unknown> = Object.fromEntries(fields.map(field => [field.name, null]))
    if (!result) return row
    const core = result.core
    const values = [core.instrumentKey, core.instrumentVersion, core.compilerVersion, core.scorerKey, core.scorerVersion,
      core.sourceDefinitionHash, core.compiledRuntimeHash, result.resultHash, result.hashScheme, core.contextHash,
      core.quality.status, core.quality.flags.join('|')]
    metadata.forEach((key, index) => { row[`${prefix}${key}`] = values[index] })
    for (const metric of core.metrics) {
      row[metricName(prefix, metric.key)] = metric.value
      row[`${metricName(prefix, metric.key)}_q`] = metric.quality ?? null
    }
    return row
  } }
}
