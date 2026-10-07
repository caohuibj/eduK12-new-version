import { describe, expect, it } from 'vitest'
import { frozenCompositeProgress } from '../../modules/composite/frozen-progress'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet, type FrozenActiveSlotV1 } from '../../modules/assessment-runtime/slot-set'
import type { AggregateSnapshotHeader } from '../../modules/assessment-runtime/unified-aggregate'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
const slots: FrozenActiveSlotV1[] = Array.from({ length: 4 }, (_, index) => ({ slotKey: `scale:${index}`, unitType: 'SCALE', required: true,
  sourceDefinitionIdentity: { key: `scale:${index}`, version: '2.0.0', hash: 'a'.repeat(64) }, sourceBinding: {} }))
const frozen = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots })
const attempt = { runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(frozen), frozenActiveSlotSetHash: frozen.snapshotHash }
const headers: AggregateSnapshotHeader[] = slots.map(slot => ({ slotKey: slot.slotKey, attemptEpoch: 1, unitType: 'SCALE', terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', sourceType: 'ASSESSMENT', sourceAttemptId: slot.slotKey }))
describe('frozen teacher progress', () => {
  it('reports 2/4 as 50%, and 4/4 as 100%, from terminal headers', () => {
    expect(frozenCompositeProgress(attempt, headers.slice(0, 2))).toMatchObject({ progress: 50, completedItems: 2, progressUnavailableReason: null })
    expect(frozenCompositeProgress(attempt, headers)).toMatchObject({ progress: 100, completedItems: 4 })
  })
  it('ignores previous epochs and refuses duplicate, foreign or corrupted current headers', () => {
    expect(frozenCompositeProgress(attempt, [{ ...headers[0], attemptEpoch: 0 }])).toMatchObject({ progress: 0, progressUnavailableReason: null })
    for (const rows of [[headers[0], headers[0]], [{ ...headers[0], slotKey: 'foreign' }], [{ ...headers[0], payloadKind: 'NONE' as const }]]) {
      expect(frozenCompositeProgress(attempt, rows)?.progressUnavailableReason).toBeTruthy()
    }
    expect(frozenCompositeProgress({ ...attempt, frozenActiveSlotSetHash: 'wrong' }, headers)?.progressUnavailableReason).toBeTruthy()
  })
  it('retains legacy progress without inventing a frozen slot set', () => {
    expect(frozenCompositeProgress({ runtimeGeneration: null }, [])).toBeNull()
  })
})
