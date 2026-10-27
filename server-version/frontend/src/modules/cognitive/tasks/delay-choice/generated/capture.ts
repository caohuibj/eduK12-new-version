import { initialState, reduce, type Config, type Plan, type Raw, type Activation } from './protocol'
/** Bounded input/stage facts only; no frame probes, logs or server timing. */
export class DelayCapture {
  readonly raw: Raw; done = false; private last: number
  constructor(readonly config: Config, plan: Plan, now: number) {
    if (!Number.isFinite(now) || now < 0) throw Error('Invalid delay clock')
    this.last = now; this.raw = { plan: structuredClone(plan), startedAtPerfMs: now, endedAtPerfMs: now, status: 'interrupted', stopReason: null, events: [], state: initialState(), ignoredRepeatCount: 0, overflow: false }
  }
  private clock(now: number) { if (!Number.isFinite(now) || now < this.last) throw Error('Nonmonotonic delay clock'); this.last = now }
  input(e: Activation) { if (this.done) return; this.clock(e.atMs); if (e.kind === 'down' && e.repeat) { this.raw.ignoredRepeatCount++; return } this.store(e) }
  private store(e: Activation) {
    if (this.raw.events.length >= 256) { this.raw.overflow = true; this.interrupt('input-log-bound', e.atMs); return }
    reduce(this.raw.state, e, this.raw.plan, this.raw.startedAtPerfMs); this.raw.events.push(e)
    if (this.raw.state.stage === 'complete') { this.raw.status = 'complete'; this.raw.stopReason = null; this.raw.endedAtPerfMs = e.atMs; this.done = true }
  }
  interrupt(reason: string, now: number) { if (this.done) return; this.clock(now); if (!reason || reason.length > 100) throw Error('delay stop reason required'); this.raw.endedAtPerfMs = now; this.raw.stopReason = reason; this.done = true }
}
