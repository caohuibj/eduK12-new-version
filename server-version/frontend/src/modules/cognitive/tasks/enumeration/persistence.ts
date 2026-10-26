import { type EnumerationTrial } from './generated/protocol'
import { enumerationDigest, enumerationContextPlan, type EnumerationArtifact, type EnumerationPageOrigin } from './display'
import type { EnumerationRecord } from './capture'
export interface EnumerationReservation { contextId: string; attemptId: string; exposureId: string; artifactHash: string;
  phase: 'test' | 'practice'; trialIndex: number; exposureOrdinal: number }
export interface EnumerationReceipt { contextId: string; exposureId: string; recordHash: string; accepted: true }
export interface EnumerationSavedRecord { record: EnumerationRecord; recordHash: string }
export interface EnumerationPersistencePort {
  /** Stable identity for this attempt's port; changing it remounts and cancels old continuation callbacks. */
  id: string
  durability: { kind: 'host_verified_browser_durable'; verificationId: string }
  /** Atomically bind the stable attempt to its first actual page origin. Any later realm ends it.
   * Changing contextId must never erase or rename an attempt's confirmed or unresolved markers. */
  openAttempt(value: { contextId: string; attemptId: string; pageOrigin: EnumerationPageOrigin }):
    Promise<{ contextId: string; attemptId: string; pageOrigin: EnumerationPageOrigin; state: 'bound' | 'ended' }>
  /** Synchronously retain an ended marker; failure cannot authorize continuing this attempt. */
  endAttempt(value: { attemptId: string; pageOrigin: EnumerationPageOrigin; reason: string }): void
  /** Artifact contains fixed mask/calibration/recipe/config once; receipt must bind its exact digest. */
  retainArtifact(artifact: EnumerationArtifact): Promise<{ contextId: string; artifactHash: string; retained: true }>
  /** Atomically prevent repeating an exposure. Unresolved reservation must never answer new. */
  reserve(exposure: EnumerationReservation): Promise<EnumerationReservation & { state: 'new' | 'unresolved_exposure' }>
  /** Stage the immutable full record synchronously on entry, then persist at trial boundary (never per frame).
   * The host owns pending/rejected retention across unmount and must expose recovery; no silent discard. */
  retain(value: EnumerationSavedRecord): Promise<EnumerationReceipt>
  /** Raw core only, no client score. ACK binds the same full-record digest. */
  onTrialComplete(core: EnumerationTrial, value: EnumerationSavedRecord): Promise<EnumerationReceipt>
  onPracticeComplete(value: EnumerationSavedRecord): Promise<EnumerationReceipt>
  /** Host confirms durable final/core/archive contract. A void/false/mismatched result cannot show saved success. */
  complete(value: { contextId: string; attemptId: string; artifactHash: string; recordHashes: string[] }):
    Promise<{ contextId: string; attemptId: string; artifactHash: string; recordHashes: string[]; confirmed: true }>
}
/** One candidate session owns its captured callbacks; dispose prevents old continuations crossing contexts. */
export class EnumerationPersistence {
  private active: { hash: string; promise: Promise<EnumerationSavedRecord> } | null = null
  private finalActive: Promise<void> | null = null
  private pending: EnumerationSavedRecord | null = null
  private disposed = false
  private accepted = new Map<string, EnumerationSavedRecord>()
  private artifactRetained = false
  private realmBound = false
  private reservationStarted = false
  private ended = false
  constructor(readonly artifact: EnumerationArtifact, readonly port: EnumerationPersistencePort) {
    const { artifactHash, ...payload } = artifact
    if (enumerationDigest(payload) !== artifactHash) throw Error('Artifact hash mismatch')
  }
  dispose() { if (this.reservationStarted) this.end('context_disposed'); this.disposed = true }
  end(reason: string) {
    if (this.ended) return
    this.ended = true
    // Continuing is disabled even if the host cannot persist its ended marker.
    try { this.port.endAttempt({ attemptId: this.artifact.context.attemptId,
      pageOrigin: this.artifact.pageOrigin, reason }) } catch { /* host-owned recovery; next realm must also be refused */ }
  }
  get attemptEnded() { return this.ended }

  private alive() { if (this.disposed) throw Error('Enumeration context was replaced') }
  async prepare(exposure: EnumerationReservation) {
    this.alive()
    if (this.ended || this.pending || this.active) throw Error('Attempt ended or an earlier record is unresolved')
    if (this.port.durability?.kind !== 'host_verified_browser_durable' || !this.port.durability.verificationId)
      throw Error('A verified durable browser port is required')
    if (!this.realmBound) {
      const request = { contextId: this.artifact.context.contextId, attemptId: this.artifact.context.attemptId,
        pageOrigin: structuredClone(this.artifact.pageOrigin) }
      const receipt = await this.port.openAttempt(request); this.alive()
      if (!receipt || receipt.state !== 'bound' || receipt.contextId !== request.contextId
        || receipt.attemptId !== request.attemptId || enumerationDigest(receipt.pageOrigin) !== enumerationDigest(request.pageOrigin))
        throw Error('Attempt belongs to an ended or different page realm')
      this.realmBound = true
    }
    if (!this.artifactRetained) {
      const receipt = await this.port.retainArtifact(structuredClone(this.artifact)); this.alive()
      if (!receipt || receipt.retained !== true || receipt.contextId !== this.artifact.context.contextId
        || receipt.artifactHash !== this.artifact.artifactHash) throw Error('Artifact retention unconfirmed')
      this.artifactRetained = true
    }
    this.reservationStarted = true
    const receipt = await this.port.reserve(structuredClone(exposure)); this.alive()
    if (!receipt || receipt.state !== 'new' || receipt.contextId !== exposure.contextId
      || receipt.attemptId !== exposure.attemptId || receipt.exposureId !== exposure.exposureId
      || receipt.artifactHash !== exposure.artifactHash || receipt.phase !== exposure.phase
      || receipt.trialIndex !== exposure.trialIndex || receipt.exposureOrdinal !== exposure.exposureOrdinal) throw Error('Exposure is unresolved; refusing to repeat it')
  }
  private receipt(receipt: EnumerationReceipt, value: EnumerationSavedRecord) {
    if (!receipt || receipt.accepted !== true || receipt.contextId !== value.record.contextId
      || receipt.exposureId !== value.record.exposureId || receipt.recordHash !== value.recordHash)
      throw Error('Record receipt does not confirm the captured record')
  }
  save(record: EnumerationRecord): Promise<EnumerationSavedRecord> {
    this.alive()
    const snapshot = structuredClone(record), recordHash = enumerationDigest(snapshot)
    if (snapshot.contextId !== this.artifact.context.contextId || snapshot.attemptId !== this.artifact.context.attemptId
      || snapshot.artifactHash !== this.artifact.artifactHash) return Promise.reject(Error('Record context mismatch'))
    const expected = enumerationContextPlan(this.artifact.context, snapshot.core.plan.trialIndex, snapshot.core.phase)
    if (snapshot.core.phase !== snapshot.core.plan.phase
      || Object.keys(expected).some(key => expected[key as keyof typeof expected] !== snapshot.core.plan[key as keyof typeof expected]))
      return Promise.reject(Error('Record truth mismatch'))
    const previouslyAccepted = this.accepted.get(snapshot.exposureId)
    if (previouslyAccepted) return previouslyAccepted.recordHash === recordHash
      ? Promise.resolve(structuredClone(previouslyAccepted)) : Promise.reject(Error('Exposure record conflicts with accepted content'))
    if (snapshot.core.phase === 'test' && !previouslyAccepted
      && snapshot.core.plan.trialIndex !== [...this.accepted.values()].filter(item => item.record.core.phase === 'test').length)
      return Promise.reject(Error('Formal records must be acknowledged in order'))
    if (this.active) return this.active.hash === recordHash ? this.active.promise : Promise.reject(Error('A different record is still saving'))
    if (this.pending && this.pending.recordHash !== recordHash) return Promise.reject(Error('Retry must preserve the captured record'))
    const value = this.pending ?? { record: snapshot, recordHash }; this.pending = value
    const promise = Promise.resolve().then(async () => {
      this.alive()
      const local = await this.port.retain(structuredClone(value)); this.alive(); this.receipt(local, value)
      const acknowledgement = value.record.core.phase === 'test'
        ? await this.port.onTrialComplete(structuredClone(value.record.core) as EnumerationTrial, structuredClone(value))
        : await this.port.onPracticeComplete(structuredClone(value))
      this.alive(); this.receipt(acknowledgement, value)
      this.accepted.set(value.record.exposureId, structuredClone(value)); this.pending = null
      return structuredClone(value)
    })
    this.active = { hash: recordHash, promise }
    const clear = () => { if (this.active?.promise === promise) this.active = null }
    void promise.then(clear, clear)
    return promise
  }
  finalize(): Promise<void> {
    this.alive()
    if (this.finalActive) return this.finalActive
    if (this.active || this.pending) return Promise.reject(Error('A captured record is not confirmed'))
    const records = [...this.accepted.values()], context = this.artifact.context
    const formal = records.filter(item => item.record.core.phase === 'test')
    const practices = records.filter(item => item.record.core.phase === 'practice' && item.record.raw.completion === 'confirmed')
    if (![0, 1, 2].every(index => practices.some(item => item.record.core.plan.trialIndex === index)))
      return Promise.reject(Error('Three confirmed practice records are required'))
    if (formal.length !== context.config.totalTrials
      || formal.some((item, index) => item.record.core.plan.trialIndex !== index))
      return Promise.reject(Error('Final formal sequence is incomplete'))
    const request = { contextId: context.contextId, attemptId: context.attemptId,
      artifactHash: this.artifact.artifactHash, recordHashes: records.map(item => item.recordHash) }
    const promise = Promise.resolve().then(async () => {
      this.alive(); const receipt = await this.port.complete(structuredClone(request)); this.alive()
      if (!receipt || receipt.confirmed !== true || receipt.contextId !== request.contextId
        || receipt.attemptId !== request.attemptId || receipt.artifactHash !== request.artifactHash
        || JSON.stringify(receipt.recordHashes) !== JSON.stringify(request.recordHashes))
        throw Error('Final saving is not confirmed')
    })
    this.finalActive = promise
    const clear = () => { if (this.finalActive === promise) this.finalActive = null }
    void promise.then(clear, clear)
    return promise
  }
}
