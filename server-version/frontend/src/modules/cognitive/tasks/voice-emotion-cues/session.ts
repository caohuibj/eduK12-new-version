import { manifest, observe, type Raw, type Event, type Plan } from './generated/protocol'
import { isPublicReport } from './generated/report'
import { validateContext, digest, freeze, type Context, type Ports, type Draft, type Final, type Receipt } from './contracts'
export type View = 'intro' | 'preparing' | 'practice-ready' | 'ready' | 'playing' | 'answer' | 'saving' | 'feedback' | 'practice-instructions' | 'formal-ready' | 'break' | 'retry' | 'finalizing' | 'report' | 'stopped' | 'blocked'
export class VoiceSession {
  readonly context: Context; readonly plans: ReturnType<typeof manifest>
  readonly realm = { timeOriginMs: performance.timeOrigin, pageInstanceId: crypto.randomUUID() }
  view: View = 'intro'; phase: 'practice' | 'test' = 'practice'; round = 0; index = 0; formalIndex = 0; matches = 0
  capture: Raw | null = null; last: Raw | null = null; receipt: Receipt | null = null; reason = ''
  private retained: Draft[] = []; private pending: Draft | null = null; private claim: Final | null = null
  private busy = false; private disposed = false; private abort = false; private endAfterSave = false; private ports: Ports
  constructor(value: Context, ports: Ports, private changed: () => void, private now = () => performance.now()) {
    this.context = validateContext(value); this.plans = freeze(manifest(this.context.snapshot.config, this.context.randomSeed)); freeze(this.realm)
    this.ports = { prepareLocalAttempt: ports.prepareLocalAttempt.bind(ports), persistLocalDraft: ports.persistLocalDraft.bind(ports), finalize: ports.finalize.bind(ports) }
  }
  get records() { return structuredClone(this.retained) }
  get practicePassed() { return this.index === 3 && this.matches >= 2 && this.retained.filter(d => d.raw.plan.phase === 'practice' && d.raw.plan.round === this.round).every(d => observe(d.raw).outcome === 'answered') }
  get currentPlan(): Plan { return this.phase === 'test' ? this.plans.formal[this.formalIndex] : this.plans.practice[this.round][this.index] }
  async prepare() {
    if (this.view !== 'intro' || this.busy || this.disposed) return
    this.busy = true; this.view = 'preparing'; this.changed()
    try {
      const binding = { context: this.context, plans: this.plans, realm: this.realm }
      const ack = await this.ports.prepareLocalAttempt(structuredClone(this.context), structuredClone(this.plans), structuredClone(this.realm))
      if (ack.prepared !== true || ack.exclusive !== true || ack.contextKey !== this.context.contextKey || ack.bindingDigest !== digest(binding)) throw Error('No exclusive durable preparation')
      if (!this.disposed) this.view = this.endAfterSave ? 'stopped' : 'practice-ready'
    } catch { this.view = 'blocked'; this.reason = 'preparation-unconfirmed' } finally { this.busy = false; this.changed() }
  }
  begin() {
    if (this.disposed || !['practice-ready', 'formal-ready', 'break'].includes(this.view)) return
    this.capture = { plan: structuredClone(this.currentPlan), startedAtPerfMs: this.now(), endedAtPerfMs: this.now(), events: [] }
    this.view = 'ready'; this.changed()
  }
  event(e: Event) {
    if (this.disposed || !this.capture || !['ready', 'playing', 'answer'].includes(this.view)) return
    if (e.kind === 'play' && this.view !== 'ready') return
    if (e.kind === 'ended' && this.view !== 'playing') return
    const raw = this.capture
    if (e.kind === 'cancel' || e.kind === 'up' || e.kind === 'down') {
      const held = new Set<string>()
      for (const old of raw.events) { if (old.kind === 'down') held.add(old.token); else if (old.kind === 'up' || old.kind === 'cancel') held.delete(old.token) }
      if (e.kind === 'down' ? held.has(e.token) : !held.has(e.token)) return
    }
    if (raw.events.length >= 64) e = { kind: 'interrupt', at: e.at, reason: 'event-budget' }
    if (e.at < raw.startedAtPerfMs || (raw.events.length && e.at < raw.events[raw.events.length - 1].at)) throw Error('Voice capture clock moved backwards')
    raw.events.push(structuredClone(e)); raw.endedAtPerfMs = e.at
    if (e.kind === 'play') this.view = 'playing'
    if (e.kind === 'ended') this.view = 'answer'
    let terminal = false
    try { observe(raw); terminal = true } catch (error) { if ((error as Error).message !== 'Unexecuted voice trial has no terminal observation') throw error }
    if (terminal) {
      const base = { contextKey: this.context.contextKey, language: this.context.language, configHash: this.context.snapshot.configHash, protocolSignature: this.context.snapshot.protocolSignature, manifestHash: this.context.manifestHash, realm: structuredClone(this.realm), recordKey: `${raw.plan.phase}:${raw.plan.round}:${raw.plan.index}`, raw: structuredClone(raw) }
      this.pending = { ...base, recordDigest: digest(base) }; this.capture = null; this.view = 'saving'; void this.save()
    }
    this.changed()
  }
  private async save() {
    if (this.busy || !this.pending) return
    this.busy = true
    try {
      const d = this.pending, ack = await this.ports.persistLocalDraft(structuredClone(d))
      if (ack.retained !== true || ack.contextKey !== d.contextKey || ack.recordKey !== d.recordKey || ack.recordDigest !== d.recordDigest) throw Error('Draft retention unconfirmed')
      this.retained.push(structuredClone(d)); this.pending = null; this.last = structuredClone(d.raw)
      if (d.raw.plan.phase === 'practice') {
        this.index++; const observed = observe(d.raw)
        if (observed.outcome === 'answered' && observed.choice === d.raw.plan.emotion) this.matches++
        this.view = this.endAfterSave ? 'stopped' : 'feedback'
      } else {
        this.formalIndex++; this.view = this.abort || this.formalIndex === this.plans.formal.length ? 'finalizing' : this.formalIndex % 24 === 0 ? 'break' : 'formal-ready'
      }
    } catch { this.view = 'retry'; this.reason = 'local-retention-unconfirmed' } finally { this.busy = false; this.changed() }
    if (this.view === 'finalizing') await this.finalize()
  }
  nextPractice() { if (this.view === 'feedback' && this.index < 3 && !this.disposed) { this.view = 'practice-ready'; this.changed() } }
  retryInstructions() {
    if (this.view !== 'feedback' || this.index !== 3 || this.practicePassed || this.round >= 1 || this.disposed) return
    this.view = 'practice-instructions'; this.changed()
  }
  finishInstructions() {
    if (this.view !== 'practice-instructions' || this.disposed) return
    this.round++; this.index = 0; this.matches = 0; this.view = 'practice-ready'; this.changed()
  }
  startFormal() {
    if (this.view !== 'feedback' || !this.practicePassed || this.disposed) return
    this.phase = 'test'; this.index = 0; this.formalIndex = 0; this.view = 'formal-ready'; this.changed()
  }
  stop(reason = 'participant-ended') {
    if (this.view === 'report' || this.view === 'stopped' || this.view === 'blocked' || this.claim) return
    this.reason = reason
    if (this.phase === 'practice') this.endAfterSave = true
    else this.abort = true
    if (this.capture) this.event({ kind: 'interrupt', at: this.now(), reason })
    else if (this.pending || this.busy) { this.changed(); return }
    else if (this.phase === 'practice') { this.view = 'stopped'; this.changed() }
    else { this.view = 'finalizing'; this.changed(); void this.finalize() }
  }
  private async finalize() {
    if (this.busy || this.pending || this.phase !== 'test') return
    this.busy = true; this.view = 'finalizing'; this.changed()
    if (!this.claim) {
      const base = { contextKey: this.context.contextKey, language: this.context.language, configHash: this.context.snapshot.configHash, protocolSignature: this.context.snapshot.protocolSignature, manifestHash: this.context.manifestHash, recordDigests: this.retained.map(d => d.recordDigest), formalCount: this.formalIndex, practiceCount: this.retained.length - this.formalIndex, termination: this.abort ? 'aborted' as const : 'completed' as const, terminationReason: this.abort ? this.reason : null }
      this.claim = { ...base, finalPayloadDigest: digest(base) }
    }
    try {
      const claim = this.claim, ack = await this.ports.finalize(structuredClone(claim)), s = this.context.snapshot
      if (ack.finalSaved !== true || ack.contextKey !== claim.contextKey || ack.finalPayloadDigest !== claim.finalPayloadDigest || !ack.receiptId || !isPublicReport(ack.report, { configHash: s.configHash, protocolSignature: s.protocolSignature, materialsHash: s.config.materialsHash, manifestHash: this.context.manifestHash, profile: s.config.profile, received: this.formalIndex })) throw Error('Final report save unconfirmed')
      this.receipt = structuredClone(ack); this.view = 'report'
    } catch { this.reason = 'final-save-unconfirmed'; this.view = 'retry' } finally { this.busy = false; this.changed() }
  }
  async retry() { if (this.view !== 'retry' || this.busy || this.disposed) return; if (this.pending) { this.view = 'saving'; await this.save() } else await this.finalize() }
  dispose() { this.stop('disposed'); this.disposed = true }
}
