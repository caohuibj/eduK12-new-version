import { IstCapture } from './capture'
import { quizPassed, type IstActivation, type IstRaw, type IstQuizRaw } from './generated/protocol'
import { isIstReport } from './generated/report'
import { digest, istManifest, validateIstContext, type IstContext, type IstDraft, type IstFinal, type IstPorts, type IstReceipt } from './contracts'
export type IstView = 'intro' | 'preparing' | 'practice-ready' | 'running' | 'saving-item' | 'practice-feedback' | 'practice-instructions' | 'quiz' | 'quiz-feedback' | 'formal-ready' | 'game-ready' | 'break' | 'retry' | 'saving-final' | 'report' | 'stopped' | 'blocked'
export class IstSession {
  readonly context: IstContext; readonly contextDigest: string; readonly manifest: ReturnType<typeof istManifest>; readonly realm = { timeOriginMs: performance.timeOrigin, pageInstanceId: crypto.randomUUID() }
  view: IstView = 'intro'; capture: IstCapture | null = null; receipt: IstReceipt | null = null; phase: 'practice' | 'test' = 'practice'; round = 0; practiceIndex = 0; formalIndex = 0; practiceFailed = false; lastRaw: IstRaw | null = null; quiz: IstQuizRaw | null = null; reason = ''
  private opened = false; private disposed = false; private aborted = false; private busy = false; private records: IstDraft[] = []; private pending: IstDraft | null = null; private final: IstFinal | null = null; private ports: IstPorts
  constructor(context: IstContext, ports: IstPorts, private changed: () => void, private now = () => performance.now()) { this.context = validateIstContext(context); this.contextDigest = digest(this.context); this.manifest = istManifest(this.context); this.ports = { prepareLocalAttempt: ports.prepareLocalAttempt.bind(ports), persistLocalDraft: ports.persistLocalDraft.bind(ports), finalize: ports.finalize.bind(ports) } }
  get retained() { return structuredClone([...this.records, ...(this.pending ? [this.pending] : [])]) }
  get practicePassed() { return this.practiceIndex === 2 && !this.practiceFailed && this.quiz !== null && quizPassed(this.quiz) }
  get canRetryPractice() { return this.round + 1 < 3 }
  async prepare() {
    if (this.view !== 'intro' || this.opened || this.disposed) return
    this.view = 'preparing'; this.changed()
    try { const receipt = await this.ports.prepareLocalAttempt(structuredClone(this.context), structuredClone(this.manifest), { ...this.realm }); if (this.disposed) return; if (receipt.fresh !== true || receipt.contextKey !== this.context.contextKey || receipt.bindingDigest !== digest({ context: this.context, manifest: this.manifest, realm: this.realm })) throw Error('Fresh durable IST identity required'); this.opened = true; this.view = 'practice-ready'; this.changed() }
    catch { if (!this.disposed) { this.reason = 'local-attempt-not-confirmed'; this.view = 'blocked'; this.changed() } }
  }
  begin(now: number) {
    if (this.disposed || !this.opened || !['practice-ready', 'practice-instructions', 'formal-ready', 'game-ready', 'break'].includes(this.view)) return
    if (this.view === 'practice-instructions') { if (!this.canRetryPractice) return; this.round++; this.practiceIndex = 0; this.practiceFailed = false; this.lastRaw = null; this.quiz = null }
    if (this.view === 'formal-ready') { if (!this.practicePassed) return; this.phase = 'test' }
    this.start(now)
  }
  private start(now: number) { const p = this.phase === 'test' ? this.manifest.formal[this.formalIndex] : this.manifest.practice[this.round][this.practiceIndex]; if (!p) throw Error('IST budget exhausted'); this.capture = new IstCapture(this.context.snapshot.config, p, now); this.view = 'running'; this.changed() }
  tick(now: number) { if (this.disposed || this.view !== 'running' || !this.capture) return; const stage = this.capture.raw.state.stage; this.capture.tick(now); if (this.capture.done) this.captureDone(); else if (stage !== this.capture.raw.state.stage) this.changed() }
  input(e: IstActivation) { if (this.disposed || this.view !== 'running' || !this.capture) return; this.capture.input(e); if (this.capture.done) this.captureDone(); else this.changed() }
  private captureDone() {
    const raw = structuredClone(this.capture!.raw); this.capture = null; this.lastRaw = raw
    if (raw.status !== 'complete') { if (this.phase === 'practice') this.practiceFailed = true; else { this.aborted = true; if (!this.reason) this.reason = raw.stopReason ?? 'capture-stopped' } }
    this.saveRecord({ phase: this.phase, round: raw.plan.round, index: raw.plan.index, raw })
  }
  private saveRecord(value: { phase: 'practice' | 'test'; round: number; index: number; raw: IstRaw } | { phase: 'quiz'; round: number; index: number; raw: IstQuizRaw }) {
    const base = { ...value, language: this.context.language, contextDigest: this.contextDigest, contextKey: this.context.contextKey, configHash: this.context.snapshot.configHash, protocolSignature: this.context.snapshot.protocolSignature, manifestHash: this.context.manifestHash, realm: { ...this.realm }, recordKey: `${value.phase}:${value.round}:${value.index}` }
    this.pending = { ...base, recordDigest: digest(base) }; this.view = 'saving-item'; this.changed(); void this.persist()
  }
  private async persist() {
    if (this.busy || !this.pending) return
    this.busy = true
    try {
      const record = this.pending, receipt = await this.ports.persistLocalDraft(structuredClone(record))
      if (receipt.retained !== true || receipt.contextKey !== record.contextKey || receipt.recordKey !== record.recordKey || receipt.recordDigest !== record.recordDigest) throw Error('IST local receipt differs')
      this.records.push(record); this.pending = null; if (this.disposed) return
      if (record.phase === 'quiz') this.view = this.aborted ? 'stopped' : 'quiz-feedback'
      else if (record.phase === 'practice') { this.practiceIndex++; this.view = this.aborted ? 'stopped' : 'practice-feedback' }
      else { this.formalIndex++; this.view = this.aborted || this.formalIndex === this.context.snapshot.config.totalTrials ? 'saving-final' : this.manifest.formal[this.formalIndex].block !== record.raw.plan.block ? 'break' : 'game-ready' }
      this.changed()
    } catch { if (!this.disposed) { this.aborted = true; if (!this.reason) this.reason = 'local-save-failure'; this.view = 'retry'; this.changed() } }
    finally { this.busy = false; if (!this.disposed && this.view === 'saving-final') void this.finish() }
  }
  nextPractice(now: number) { if (!this.disposed && this.view === 'practice-feedback' && this.practiceIndex < 2 && !this.practiceFailed) this.start(now) }
  beginQuiz(now: number) { if (this.disposed || this.view !== 'practice-feedback' || this.practiceIndex !== 2 || this.practiceFailed) return; this.quiz = { round: this.round, startedAtPerfMs: now, endedAtPerfMs: now, answers: [null, null, null], submitted: false }; this.view = 'quiz'; this.changed() }
  answerQuiz(index: number, answer: number) { if (this.disposed || this.view !== 'quiz' || !this.quiz || !Number.isInteger(index) || index < 0 || index > 2 || !Number.isInteger(answer) || answer < 0 || answer >= [2, 2, 3][index]) return; this.quiz.answers[index] = answer; this.changed() }
  submitQuiz(now: number) { if (this.disposed || this.view !== 'quiz' || !this.quiz || this.quiz.answers.some(x => x === null) || now < this.quiz.startedAtPerfMs) return; this.quiz.submitted = true; this.quiz.endedAtPerfMs = now; this.practiceFailed = !quizPassed(this.quiz); this.saveRecord({ phase: 'quiz', round: this.round, index: 0, raw: structuredClone(this.quiz) }) }
  acceptPractice() { if (this.disposed || this.view !== 'quiz-feedback' || !this.practicePassed) return; this.view = 'formal-ready'; this.changed() }
  reviewInstructions() { if (this.disposed || !['practice-feedback', 'quiz-feedback'].includes(this.view) || !this.practiceFailed || !this.canRetryPractice) return; this.view = 'practice-instructions'; this.changed() }
  endPractice() {
    if (this.disposed || this.phase !== 'practice' || !['intro', 'practice-ready', 'practice-feedback', 'practice-instructions', 'quiz', 'quiz-feedback', 'formal-ready'].includes(this.view)) return
    this.reason = 'practice-ended'; this.aborted = true
    if (this.view === 'quiz' && this.quiz) { this.quiz.endedAtPerfMs = this.now(); this.saveRecord({ phase: 'quiz', round: this.round, index: 0, raw: structuredClone(this.quiz) }) } else { this.view = 'stopped'; this.changed() }
  }
  stop(reason: string, now: number) {
    if (this.disposed || !['running', 'saving-item', 'formal-ready', 'game-ready', 'break'].includes(this.view)) return
    if (this.phase === 'test' || this.view === 'saving-item') { this.aborted = true; if (!this.reason) this.reason = reason }
    if (this.capture) { this.capture.interrupt(reason, now); this.captureDone() }
    else if (this.view === 'saving-item') { this.aborted = true; if (!this.reason) this.reason = reason }
    else if (this.phase === 'test') { this.view = 'saving-final'; this.changed(); void this.finish() }
    else { this.view = 'stopped'; this.changed() }
  }
  async retry() { if (this.disposed || this.busy || this.view !== 'retry') return; if (this.pending) await this.persist(); else await this.finish() }
  private async finish() {
    if (this.disposed || this.busy || this.pending || this.phase !== 'test') return
    this.busy = true; this.view = 'saving-final'; this.changed()
    try {
      if (!this.final) { const claim = { language: this.context.language, contextDigest: this.contextDigest, contextKey: this.context.contextKey, configHash: this.context.snapshot.configHash, protocolSignature: this.context.snapshot.protocolSignature, manifestHash: this.context.manifestHash, formalCount: this.records.filter(r => r.phase === 'test').length, practiceCount: this.records.filter(r => r.phase === 'practice').length, quizCount: this.records.filter(r => r.phase === 'quiz').length, termination: (!this.aborted && this.formalIndex === this.context.snapshot.config.totalTrials ? 'completed' : 'aborted') as 'completed' | 'aborted', terminationReason: this.reason || null, recordDigests: this.records.map(r => r.recordDigest) }; this.final = { ...claim, finalPayloadDigest: digest(claim) } }
      const receipt = await this.ports.finalize(structuredClone(this.final)); if (this.disposed) return
      if (receipt.finalSaved !== true || receipt.contextKey !== this.context.contextKey || receipt.finalPayloadDigest !== this.final.finalPayloadDigest || !receipt.receiptId || !isIstReport(receipt.report, { configHash: this.context.snapshot.configHash, protocolSignature: this.context.snapshot.protocolSignature, profile: this.context.snapshot.config.profile, presented: this.final.formalCount, configVersion: this.context.snapshot.configVersion, presentationVersion: this.context.snapshot.config.presentationVersion })) throw Error('Matching saved IST report required')
      this.receipt = structuredClone(receipt); this.view = 'report'; this.changed()
    } catch { if (!this.disposed) { this.view = 'retry'; this.changed() } } finally { this.busy = false }
  }
  dispose() { if (this.capture && this.view === 'running') this.stop('context-disposed', this.now()); else if (this.view === 'quiz') this.endPractice(); this.disposed = true }
}
