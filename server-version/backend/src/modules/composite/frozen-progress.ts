import { decryptFrozenActiveSlotSet } from '../assessment-runtime/slot-set'
import { evaluateCompleteness, type AggregateSnapshotHeader } from '../assessment-runtime/unified-aggregate'

export const frozenCompositeProgress = (attempt: {
  runtimeGeneration?: string | null; attemptEpoch?: number;
  frozenActiveSlotSetEncrypted?: string | null; frozenActiveSlotSetHash?: string | null;
}, headers: AggregateSnapshotHeader[]) => {
  if (attempt.runtimeGeneration !== 'UNIFIED_V1') return null
  try {
    if (!attempt.frozenActiveSlotSetEncrypted || !attempt.frozenActiveSlotSetHash) throw new Error('missing frozen slots')
    const frozen = decryptFrozenActiveSlotSet(attempt.frozenActiveSlotSetEncrypted)
    if (frozen.runtimeGeneration !== 'UNIFIED_V1' || frozen.snapshotHash !== attempt.frozenActiveSlotSetHash || frozen.attemptEpoch !== attempt.attemptEpoch) throw new Error('frozen identity mismatch')
    const complete = evaluateCompleteness({ slots: frozen.slots, snapshots: headers.filter(header => header.attemptEpoch === attempt.attemptEpoch), attemptEpoch: frozen.attemptEpoch })
    if (complete.invalidSlotKeys.length) throw new Error('invalid terminal headers')
    return { progress: complete.progress, completedItems: complete.completedSlotCount, progressUnavailableReason: null }
  } catch {
    return { progress: 0, completedItems: 0, progressUnavailableReason: '冻结单元进度暂不可读，请核查记录完整性。' }
  }
}
