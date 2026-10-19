import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AssessmentUnitSnapshot } from '@prisma/client'
import { createCanonicalUnitResultEnvelope, type CanonicalUnitResultCoreV1 } from '../../modules/assessment-runtime/unit-result'
import { loadSituationalExportSlotSets, readSituationalExportResults as readBoundResults, situationalExportColumns, situationalSummaryFieldAllowed } from '../../modules/composite/situational-canonical-export'

vi.mock('../../modules/assessment-runtime/security', () => ({ decryptUnifiedRuntimePayload: (value: string) => JSON.parse(value) }))
import { createFrozenActiveSlotSet, type FrozenActiveSlotSetV1 } from '../../modules/assessment-runtime/slot-set'
import { publicTemplates } from '../../modules/assessment-runtime/public-templates'
vi.mock('../../modules/assessment-runtime/public-templates', () => {
  const publicTemplates = { loadMany: vi.fn() }
  return { publicTemplates, publicTemplatesForDatabase: () => publicTemplates }
})
const parent = { id: 'parent', attemptEpoch: 2, contextSnapshotHash: 'context' }
const core: CanonicalUnitResultCoreV1 = {
  schemaVersion: 1, unitType: 'SITUATIONAL', instrumentKey: 'accepted', instrumentVersion: '1',
  sourceDefinitionHash: 'a'.repeat(64), compilerVersion: '1', compiledRuntimeHash: 'b'.repeat(64),
  scorerKey: 'sjt', scorerVersion: '1', quality: { status: 'limited', flags: ['missing'] },
  metrics: [{ key: 'a-b', value: null, quality: 'limited' }, { key: 'a_b', value: 0 }],
  facts: [{ key: 'never_export', value: 'SECRET' }], references: [], contextHash: 'context',
  scientificProvenance: { instrumentKey: 'accepted', instrumentVersion: '1' },
}
const frozen = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 2, slots: [{
  slotKey: 'situational:item', unitType: 'SITUATIONAL', required: true,
  sourceDefinitionIdentity: { key: core.instrumentKey, version: core.instrumentVersion, hash: core.sourceDefinitionHash }, sourceBinding: {},
  runtimeIdentity: { instrumentKey: core.instrumentKey, instrumentVersion: core.instrumentVersion, definitionHash: core.sourceDefinitionHash,
    compiledRuntimeHash: core.compiledRuntimeHash, scorerKey: core.scorerKey, scoringVersion: core.scorerVersion,
    runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', frozenAt: '2026-10-18T00:00:00.000Z' },
}] })
const readSituationalExportResults = (attempt: typeof parent, rows: AssessmentUnitSnapshot[], slots: FrozenActiveSlotSetV1 = frozen) => readBoundResults(attempt, rows, slots)
const envelope = (value = core) => createCanonicalUnitResultEnvelope({ core: value, completedAt: '2026-10-18T00:00:00.000Z', persistenceProvenance: { sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'child', sourceSubmissionId: 'submit' } })
const snapshot = (value = envelope()): AssessmentUnitSnapshot => ({
  id: 'snapshot', questionnaireAssessmentId: null, compositeAttemptId: parent.id, attemptEpoch: 2,
  slotKey: 'situational:item', unitType: 'SITUATIONAL', terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT',
  sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'child', sourceSubmissionId: 'submit',
  sourceDefinitionHash: core.sourceDefinitionHash, compiledRuntimeHash: core.compiledRuntimeHash,
  canonicalResultEncrypted: JSON.stringify(value), collectionFactsEncrypted: null,
  completedAt: new Date(value.completedAt), createdAt: new Date(value.completedAt),
})

describe('Composite SJT accepted canonical summary', () => {
  it('keeps numeric zero distinct from null, quality, versions and hash, excluding facts/bridge/raw', () => {
    const result = readSituationalExportResults(parent, [snapshot()]).get('situational:item')!
    const columns = situationalExportColumns('J001_', 'SJT', [result])
    const row = columns.read(result)
    const metrics = columns.fields.filter(field => field.type === 'numeric')
    expect(metrics).toHaveLength(2)
    expect(metrics[0].name).not.toBe(metrics[1].name)
    expect(metrics.map(field => row[field.name])).toEqual([null, 0])
    expect(row.J001_quality_status).toBe('limited')
    expect(row.J001_instrument_version).toBe('1')
    expect(row.J001_result_hash).toBe(envelope().resultHash)
    expect(JSON.stringify(row)).not.toMatch(/SECRET|never_export|responses|contributions/)
    expect(columns.fields.every(field => situationalSummaryFieldAllowed(field.name.slice(5)))).toBe(true)
    expect(situationalSummaryFieldAllowed('raw_responses')).toBe(false)
  })
  it('has identity fields without records and fills absent metrics with null', () => {
    const columns = situationalExportColumns('J001_', 'SJT', [envelope()])
    expect(columns.read(null).J001_terminal_state).toBe('NOT_ACTIVE')
    expect(Object.entries(columns.read(null)).filter(([key]) => key !== 'J001_terminal_state').every(([, value]) => value === null)).toBe(true)
    expect(situationalExportColumns('J001_', 'SJT', []).fields.some(field => field.name === 'J001_result_hash')).toBe(true)
  })
  it.each([
    { attemptEpoch: 1 }, { compositeAttemptId: 'other' }, { sourceAttemptId: 'other' },
    { sourceSubmissionId: 'other' }, { sourceDefinitionHash: 'other' }, { compiledRuntimeHash: 'other' },
    { canonicalResultEncrypted: null }, { payloadKind: 'NONE' }, { sourceType: 'ASSESSMENT' },
  ])('fails closed for mismatched accepted identity %j', patch => {
    expect(() => readSituationalExportResults(parent, [{ ...snapshot(), ...patch } as AssessmentUnitSnapshot])).toThrow()
  })
  it('rejects altered content, context, duplicate slots/metrics and nonnumeric metrics', () => {
    expect(() => readSituationalExportResults(parent, [snapshot({ ...envelope(), resultHash: 'c'.repeat(64) })])).toThrow()
    expect(() => readSituationalExportResults({ ...parent, contextSnapshotHash: 'changed' }, [snapshot()])).toThrow()
    expect(() => readSituationalExportResults(parent, [snapshot(), snapshot()])).toThrow()
    for (const metrics of [[{ key: 'x', value: 1 }, { key: 'x', value: 2 }], [{ key: 'x', value: 'raw' }]]) {
      expect(() => readSituationalExportResults(parent, [snapshot(envelope({ ...core, metrics }))])).toThrow()
    }
  })
  it('preserves explicit terminal missingness without synthesizing results', () => {
    const skipped = { ...snapshot(), terminalState: 'SKIPPED' as const, payloadKind: 'NONE' as const, canonicalResultEncrypted: null }
    expect(() => readSituationalExportResults(parent, [skipped])).toThrow()
    const { snapshotHash: _hash, ...unsigned } = frozen
    const optional = createFrozenActiveSlotSet({ ...unsigned, slots: frozen.slots.map(slot => ({ ...slot, required: false })) })
    expect(readSituationalExportResults(parent, [skipped], optional).get('situational:item')).toBeNull()
    expect(situationalExportColumns('J001_', 'SJT', []).read(null, 'SKIPPED').J001_terminal_state).toBe('SKIPPED')
    expect(() => readSituationalExportResults(parent, [{ ...skipped, canonicalResultEncrypted: snapshot().canonicalResultEncrypted }])).toThrow()
  })
})


it('uses the bounded snapshot path and retains standalone embedded/raw rejection', () => {
  const service = readFileSync(resolve(process.cwd(), 'src/modules/composite/composite-export.service.ts'), 'utf8')
  expect(service.match(/prisma\.assessmentUnitSnapshot\.findMany/g)).toHaveLength(1)
  expect(service).toContain('compositeAttemptId:attempt.id,attemptEpoch:attempt.attemptEpoch')
  expect(service).not.toMatch(/prisma\.situationalAttempt|rawSubmission|runtimeSnapshotEncrypted/)
  const research = readFileSync(resolve(process.cwd(), 'src/modules/situational/situation-research-export.ts'), 'utf8')
  expect(research).toContain('if (input.embedded) throw denied()')
  expect(research).toContain('authorizeSituationalResearchExport(authority)')
})


it('requires every frozen required SJT and rejects a self-consistent different instrument/runtime', () => {
  expect(() => readSituationalExportResults(parent, [])).toThrow('required snapshot missing')
  expect(() => readSituationalExportResults(parent, [{ ...snapshot(), slotKey: 'situational:foreign' }])).toThrow()
  for (const patch of [{ instrumentKey: 'other' }, { instrumentVersion: '2' }, { scorerVersion: '2' }, { scorerKey: 'other' }, { compiledRuntimeHash: 'c'.repeat(64) }, { sourceDefinitionHash: 'c'.repeat(64) }]) {
    const altered = envelope({ ...core, ...patch })
    expect(() => readSituationalExportResults(parent, [{ ...snapshot(altered), sourceDefinitionHash: altered.core.sourceDefinitionHash, compiledRuntimeHash: altered.core.compiledRuntimeHash }])).toThrow('canonical binding mismatch')
  }
})

it('batch-resolves shared slot plans once and binds each parent epoch/hash', async () => {
  const { attemptEpoch: _epoch, snapshotHash: _hash, ...plan } = frozen
  vi.mocked(publicTemplates.loadMany).mockResolvedValue([plan])
  const hash = 'd'.repeat(64)
  const a = { ...parent, runtimeGeneration: 'UNIFIED_V1', frozenActiveSlotSetHash: frozen.snapshotHash, frozenActiveSlotSetEncrypted: JSON.stringify({ k: 'FSP2', p: hash, e: 2 }) }
  const loaded = await loadSituationalExportSlotSets([a, { ...a, id: 'second' }])
  expect(loaded.size).toBe(2)
  expect(publicTemplates.loadMany).toHaveBeenCalledTimes(1)
  expect(publicTemplates.loadMany).toHaveBeenCalledWith([{ hash, kind: 'FROZEN_SLOT_PLAN' }])
  await expect(loadSituationalExportSlotSets([{ ...a, frozenActiveSlotSetHash: 'wrong' }])).rejects.toThrow('parent binding mismatch')
  await expect(loadSituationalExportSlotSets([{ ...a, attemptEpoch: 3 }])).rejects.toThrow('parent binding mismatch')
  await expect(loadSituationalExportSlotSets([{ ...a, frozenActiveSlotSetEncrypted: null }])).rejects.toThrow('slots missing')
  const inline = await loadSituationalExportSlotSets([{ ...a, frozenActiveSlotSetEncrypted: JSON.stringify(frozen) }])
  expect(inline.get(a.id)).toEqual(frozen)
})
