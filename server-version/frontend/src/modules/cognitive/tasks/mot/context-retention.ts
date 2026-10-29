import { motDraftKey, MotDraftError, type MotDraftBinding, type MotDraftPort, type MotDraftRecord } from './draft'
/** Page-local failure protection, not durable storage or a server exposure lock. No pending raw is evicted. */
export const MOT_RETAINED_CONTEXT_LIMIT = 8
export type MotRecordPhase = 'formal' | 'practice'
export interface MotRecoverySlot {
  readonly key: string
  readonly binding: Readonly<MotDraftBinding>
  owner: object | null
  record: MotDraftRecord | null
  phase: MotRecordPhase | null
  localSaved: boolean
  preparation: Promise<unknown> | null
  localSave: Promise<void> | null
}
const slots = new Map<string, MotRecoverySlot>()
/** A slot is claimed before asynchronous preparation or any capture. Capacity failure never drops old raw. */
export function claimMotRecovery(binding: MotDraftBinding, owner: object): MotRecoverySlot {
  const key = motDraftKey(binding), existing = slots.get(key)
  if (existing) {
    if ((existing.owner || existing.preparation) && existing.owner !== owner) throw new MotDraftError('CONFLICT', 'This MOT identity is already active in this page')
    existing.owner = owner; return existing
  }
  if (slots.size >= MOT_RETAINED_CONTEXT_LIMIT) throw new MotDraftError('BUDGET', 'Unresolved MOT records fill the page recovery budget')
  const slot: MotRecoverySlot = { key, binding: Object.freeze(structuredClone(binding)), owner,
    record: null, phase: null, localSaved: false, preparation: null, localSave: null }
  slots.set(key, slot); return slot
}
/** A detached preparation still owns its identity until its original operation settles. */
export function prepareMotRecovery<T>(slot: MotRecoverySlot, operation: () => Promise<T>): Promise<T> {
  if (slot.preparation) return Promise.reject(new MotDraftError('CONFLICT', 'An earlier MOT preparation is unresolved'))
  const promise = Promise.resolve().then(operation)
  slot.preparation = promise
  const clear = () => {
    if (slot.preparation === promise) slot.preparation = null
    if (!slot.owner && !slot.record && slots.get(slot.key) === slot) slots.delete(slot.key)
  }
  void promise.then(clear, clear)
  return promise
}
export function retainMotRecovery(slot: MotRecoverySlot, phase: MotRecordPhase, record: MotDraftRecord): void {
  if (slots.get(slot.key) !== slot) throw new MotDraftError('CONFLICT', 'MOT recovery identity was replaced')
  const snapshot = structuredClone(record)
  if (slot.record && (slot.phase !== phase || JSON.stringify(slot.record) !== JSON.stringify(snapshot)))
    throw new MotDraftError('CONFLICT', 'An unresolved MOT record must be recovered before another exposure')
  slot.phase = phase; slot.record ??= snapshot
}
/** Reuses an in-flight original draft write, including after remount; practice is never appended twice on that path. */
export function saveMotRecoveryLocally(slot: MotRecoverySlot, draft: MotDraftPort): Promise<void> {
  if (motDraftKey(draft.binding) !== slot.key || !slot.record || !slot.phase)
    return Promise.reject(new MotDraftError('CONFLICT', 'MOT recovery draft does not match the retained record'))
  if (slot.localSaved) return Promise.resolve()
  if (slot.localSave) return slot.localSave
  const record = structuredClone(slot.record), phase = slot.phase
  const promise = Promise.resolve().then(() => phase === 'formal' ? draft.append(record) : draft.appendPractice(record))
    .then(() => { slot.localSaved = true })
  slot.localSave = promise
  const clear = () => { if (slot.localSave === promise) slot.localSave = null }
  void promise.then(clear, clear)
  return promise
}
export function releaseMotRecovery(slot: MotRecoverySlot): void {
  if (slots.get(slot.key) === slot) slots.delete(slot.key)
}
export function detachMotRecovery(slot: MotRecoverySlot, owner: object): void {
  if (slot.owner !== owner) return
  slot.owner = null
  if (!slot.record && !slot.preparation && slots.get(slot.key) === slot) slots.delete(slot.key)
}
/** Recovery/export integration port. Copies remain under their original full binding; callers cannot mutate retained raw. */
export function readMotRetainedRecord(binding: MotDraftBinding) {
  const slot = slots.get(motDraftKey(binding))
  return slot?.record ? { binding: structuredClone(slot.binding), phase: slot.phase!,
    record: structuredClone(slot.record), localSaved: slot.localSaved } : null
}
export function listMotRetainedRecords() {
  return [...slots.values()].filter(slot => slot.record).map(slot => readMotRetainedRecord(slot.binding)!)
}
/** Freeze and bind methods as well as the identity: host objects may be reconstructed during rerender. */
export function freezeMotDraftPort(draft: MotDraftPort): MotDraftPort {
  return Object.freeze({ binding: Object.freeze(JSON.parse(motDraftKey(draft.binding)) as MotDraftBinding),
    pending: draft.pending.bind(draft), begin: draft.begin.bind(draft), append: draft.append.bind(draft),
    records: draft.records.bind(draft), appendPractice: draft.appendPractice.bind(draft), practices: draft.practices.bind(draft),
    ...(draft.close ? { close: draft.close.bind(draft) } : {}) })
}
