import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createFrozenActiveSlotSet, type FrozenActiveSlotV1 } from '../../modules/assessment-runtime/slot-set'
import { buildAggregateInputHash, evaluateCompleteness, UNIFIED_AGGREGATE_HASH_SCHEME } from '../../modules/assessment-runtime/unified-aggregate'

const hash = 'a'.repeat(64)
const slots: FrozenActiveSlotV1[] = ['first', 'future'].map(id => ({ slotKey: `scale:${id}`, unitType: 'SCALE', required: true,
  sourceDefinitionIdentity: { key: id, version: '1', hash }, sourceBinding: { compiledRuntimeHash: hash } }))
const header = { slotKey: 'scale:first', attemptEpoch: 1, unitType: 'SCALE' as const,
  terminalState: 'COMPLETED' as const, payloadKind: 'UNIT_RESULT' as const, sourceType: 'ASSESSMENT', sourceAttemptId: 'accepted' }
const policy = { kind: 'TRAINING_FLOW_V1' as const, terminal: true, reachedSlotKeys: ['scale:first'], executedSlotKeys: ['scale:first'] }

describe('explicit training path aggregate policy', () => {
  it('keeps the complete candidate freeze immutable and requires only actual terminal-path snapshots', () => {
    const freeze = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots })
    const original = JSON.stringify(freeze)
    expect(evaluateCompleteness({ slots: freeze.slots, snapshots: [header], attemptEpoch: 1, pathPolicy: policy })).toMatchObject({ ready: true, completedSlotCount: 1, progress: 100, missingSlotKeys: [] })
    expect(JSON.stringify(freeze)).toBe(original)
    expect(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1 })).toMatchObject({ ready: false, missingSlotKeys: ['scale:future'] })
    expect(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1, pathPolicy: null })).toEqual(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1 }))
  })
  it('cannot finish a pending path or manufacture skipped and future facts', () => {
    expect(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1, pathPolicy: { ...policy, terminal: false } })).toMatchObject({ ready: false, progress: 99 })
    expect(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1, pathPolicy: { ...policy, terminal: false, reachedSlotKeys: slots.map(slot => slot.slotKey) } })).toMatchObject({ ready: false, missingSlotKeys: ['scale:future'], progress: 50 })
    for (const foreign of [{ ...header, slotKey: 'scale:future' }, { ...header, terminalState: 'SKIPPED' as const, payloadKind: 'NONE' as const }, { ...header, attemptEpoch: 2 }]) {
      expect(evaluateCompleteness({ slots, snapshots: [foreign], attemptEpoch: 1, pathPolicy: policy }).ready).toBe(false)
      expect(evaluateCompleteness({ slots, snapshots: [foreign], attemptEpoch: 1, pathPolicy: policy }).invalidSlotKeys).toHaveLength(1)
    }
    expect(evaluateCompleteness({ slots, snapshots: [header, header], attemptEpoch: 1, pathPolicy: policy }).invalidSlotKeys).toEqual(['scale:first'])
    expect(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1, pathPolicy: { ...policy, executedSlotKeys: ['scale:future'] } }).ready).toBe(false)
  })
  it('does not let missing or duplicate executed identities erase a required fact', () => {
    expect(evaluateCompleteness({ slots, snapshots: [], attemptEpoch: 1, pathPolicy: policy })).toMatchObject({ ready: false, missingSlotKeys: ['scale:first'] })
    expect(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1, pathPolicy: { ...policy, reachedSlotKeys: ['scale:first', 'scale:first'] } }).invalidSlotKeys).toEqual(['scale:first'])
    expect(evaluateCompleteness({ slots, snapshots: [header], attemptEpoch: 1, pathPolicy: { ...policy, reachedSlotKeys: ['scale:unknown'] } }).ready).toBe(false)
  })
  it('preserves byte-identical legacy hash inputs and binds explicit path evidence', () => {
    const entries = [{ slotKey: header.slotKey, terminalState: header.terminalState, payloadKind: header.payloadKind, resultHash: hash }]
    const input = { attemptEpoch: 1, entries }
    const expected = canonicalHash({ hashScheme: UNIFIED_AGGREGATE_HASH_SCHEME, attemptEpoch: 1,
      contextHash: null, compiledBundleRuntimeHash: null, slots: entries })
    expect(buildAggregateInputHash(input)).toBe(expected)
    expect(buildAggregateInputHash({ ...input, trainingFlowPath: null })).toBe(expected)
    const path = { pathHash: hash, evidence: { termination: 'COMPLETE_EARLY', accepted: ['first'] } }
    const flowHash = buildAggregateInputHash({ ...input, trainingFlowPath: path })
    expect(flowHash).not.toBe(expected)
    expect(buildAggregateInputHash({ ...input, trainingFlowPath: { ...path, pathHash: 'b'.repeat(64) } })).not.toBe(flowHash)
    expect(buildAggregateInputHash({ ...input, trainingFlowPath: { ...path, evidence: { ...path.evidence, termination: 'SCREEN_OUT' } } })).not.toBe(flowHash)
  })
})
