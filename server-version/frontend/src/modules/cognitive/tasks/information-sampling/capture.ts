import { initialIstState, reduceIstEvent, type IstConfig, type IstPlan, type IstRaw, type IstEvent, type IstActivation } from './generated/protocol'
/** Bounded input/stage facts only; no frame probes, logs or server timing. */
export class IstCapture {
  readonly raw: IstRaw; done = false; private last: number
  constructor(readonly config: IstConfig, plan: IstPlan, now: number) {
    if (!Number.isFinite(now) || now < 0) throw Error('Invalid IST clock')
    this.last = now; this.raw = { plan: structuredClone(plan), startedAtPerfMs: now, endedAtPerfMs: now, status: 'interrupted', stopReason: null, events: [], state: initialIstState(), ignoredRepeatCount: 0, overflow: false }
  }
  private clock(now: number) { if (!Number.isFinite(now) || now < this.last) throw Error('Nonmonotonic IST clock'); this.last = now }
  input(e: IstActivation) { if (this.done) return; this.clock(e.atMs); if (e.kind === 'down' && e.repeat) { this.raw.ignoredRepeatCount++; return } this.store(e) }
  tick(now: number) { if (this.done) return; this.clock(now); if (this.raw.state.stage === 'feedback' && this.raw.state.feedbackUntilMs !== null && now >= this.raw.state.feedbackUntilMs) this.store({ kind: 'feedback-ended', atMs: now }) }
  private store(e: IstEvent) {
    if (this.raw.events.length >= 256) { this.raw.overflow = true; this.interrupt('input-log-bound', e.atMs); return }
    reduceIstEvent(this.raw.state, e, this.raw.plan, this.config, this.raw.startedAtPerfMs); this.raw.events.push(e)
    if (this.raw.state.stage === 'complete') { this.raw.status = 'complete'; this.raw.stopReason = null; this.raw.endedAtPerfMs = e.atMs; this.done = true }
  }
  interrupt(reason: string, now: number) { if (this.done) return; this.clock(now); if (!reason || reason.length > 100) throw Error('IST stop reason required'); this.raw.endedAtPerfMs = now; this.raw.stopReason = reason; this.done = true }
}
