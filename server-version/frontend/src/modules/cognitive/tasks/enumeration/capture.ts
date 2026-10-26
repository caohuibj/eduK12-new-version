import { ENUMERATION_IDENTITY, type EnumerationInput, type EnumerationPlan, type EnumerationTrial } from './generated/protocol'
import { enumerationStimulus, type EnumerationArtifact, type EnumerationContext, type EnumerationStimulus } from './display'
export type EnumerationStage = 'pending' | 'fixation' | 'stimulus' | 'mask' | 'response' | 'complete'
export const ENUMERATION_MAX_FRAME_RECORDS = 20000
export type EnumerationCaptureCore = Omit<EnumerationTrial, 'phase'> & { phase: 'test' | 'practice' }
export interface EnumerationRecord {
  schemaVersion: 1
  candidateId: typeof ENUMERATION_IDENTITY.candidateId
  contextId: string
  attemptId: string
  exposureId: string
  exposureOrdinal: number
  artifactHash: string
  core: EnumerationCaptureCore
  stimulus: EnumerationStimulus
  raw: {
    clock: 'performance'
    onsetMeaning: 'client_reported_raf_draw_command_not_physical_onset'
    frames: Array<{ stage: 'fixation' | 'stimulus' | 'mask' | 'response'; atPerfMs: number }>
    prematureEvents: Array<{ atPerfMs: number; input: EnumerationInput }>
    interactionOverflow: boolean
    exposurePainted: boolean
    completion: 'confirmed' | 'interrupted' | 'telemetry_overflow'
  }
}
/** One transition per actual paint. A delayed frame never fabricates past presentation timestamps. */
export class EnumerationCapture {
  stage: EnumerationStage = 'pending'
  sliderValue: number
  readonly core: EnumerationCaptureCore
  readonly stimulus: EnumerationStimulus
  private frames: EnumerationRecord['raw']['frames'] = []
  private prematureEvents: EnumerationRecord['raw']['prematureEvents'] = []
  private lastNow = -1
  private overflow = false
  private completion: EnumerationRecord['raw']['completion'] = 'interrupted'
  constructor(readonly context: EnumerationContext, readonly plan: EnumerationPlan,
    readonly exposureId: string, readonly artifactHash: string, readonly exposureOrdinal = 0) {
    if (!Number.isInteger(exposureOrdinal) || exposureOrdinal < 0 || exposureOrdinal > 11
      || (plan.phase === 'test' && exposureOrdinal !== 0)) throw Error('Invalid explicit exposure ordinal')
    this.stimulus = enumerationStimulus(context, plan, exposureId)
    this.sliderValue = plan.sliderInitialValue
    this.core = { phase: plan.phase, plan: structuredClone(plan), recordOrigin: 'live',
      startedAtPerfMs: 0, stimulusOnsetPerfMs: null, maskOnsetPerfMs: null, responseStartedAtPerfMs: null,
      confirmedAtPerfMs: null, endedAtPerfMs: 0, responseValue: null, responseInput: null,
      sliderChanges: [], prematureInputs: 0, timedOut: false, interruptions: [],
      timingFacts: { source: 'client_reported', stimulusFrameCount: null, maskFrameCount: null,
        stimulusMaxFrameGapMs: null, maskMaxFrameGapMs: null, incomplete: true, overflow: false },
      calibrationReference: context.calibration!.id, renderedStimulusReference: artifactHash }
  }
  private clock(now: number) {
    if (!Number.isFinite(now) || now < 0 || now < this.lastNow) throw Error('Enumeration clock must be finite and monotonic')
    this.lastNow = now
  }
  frame(now: number): EnumerationStage {
    if (this.stage === 'complete' || this.stage === 'response') return this.stage
    this.clock(now)
    if (this.frames.length >= ENUMERATION_MAX_FRAME_RECORDS) {
      this.overflow = true; this.finish(now, 'telemetry_overflow'); return this.stage
    }
    const t = this.core, recipe = this.context.recipe!
    if (this.stage === 'pending') { t.startedAtPerfMs = now; this.stage = 'fixation' }
    else if (this.stage === 'fixation' && now - t.startedAtPerfMs >= recipe.fixationMs) {
      t.stimulusOnsetPerfMs = now; this.stage = 'stimulus'
    } else if (this.stage === 'stimulus' && now - t.stimulusOnsetPerfMs! >= (this.plan.phase === 'practice' ? recipe.practiceExposureMs : recipe.formalExposureMs)) {
      t.maskOnsetPerfMs = now; this.stage = 'mask'
    } else if (this.stage === 'mask' && now - t.maskOnsetPerfMs! >= recipe.maskMs) {
      t.responseStartedAtPerfMs = now; this.stage = 'response'
    }
    this.frames.push({ stage: this.stage, atPerfMs: now })
    return this.stage
  }
  premature(input: EnumerationInput, now: number): void {
    if (this.stage === 'complete' || this.stage === 'response') return
    this.clock(now)
    if (this.prematureEvents.length >= 256) { this.overflow = true; this.finish(now, 'telemetry_overflow'); return }
    this.core.prematureInputs++; this.prematureEvents.push({ input, atPerfMs: now })
  }
  change(value: number, input: EnumerationInput, now: number): boolean {
    if (this.stage !== 'response') { this.premature(input, now); return false }
    this.clock(now)
    if (!Number.isInteger(value) || value < 1 || value > 15) throw Error('Enumeration answer must remain an integer in 1–15')
    if (this.core.sliderChanges.length >= 512) { this.overflow = true; this.finish(now, 'telemetry_overflow'); return false }
    this.sliderValue = value; this.core.sliderChanges.push({ value, input, atPerfMs: now }); return true
  }
  confirm(input: EnumerationInput, now: number): boolean {
    if (this.stage !== 'response') { this.premature(input, now); return false }
    this.clock(now)
    this.core.responseValue = this.sliderValue; this.core.responseInput = input; this.core.confirmedAtPerfMs = now
    this.finish(now, 'confirmed'); return true
  }
  interrupt(reason: EnumerationTrial['interruptions'][number], now: number) {
    if (this.stage === 'complete') return
    this.clock(now)
    if (this.stage === 'pending') this.core.startedAtPerfMs = now
    if (!this.core.interruptions.includes(reason)) this.core.interruptions.push(reason)
    this.finish(now, 'interrupted')
  }
  private finish(now: number, completion: EnumerationRecord['raw']['completion']) {
    const t = this.core
    if (this.stage === 'pending') t.startedAtPerfMs = now
    t.endedAtPerfMs = now; this.completion = completion
    const summary = (stage: 'stimulus' | 'mask', boundary: number | null) => {
      const times = this.frames.filter(frame => frame.stage === stage).map(frame => frame.atPerfMs)
      const gaps = times.slice(1).map((value, i) => value - times[i])
      if (times.length && boundary !== null) gaps.push(boundary - times[times.length - 1])
      return { count: times.length, maxGap: gaps.length ? Math.max(...gaps) : null }
    }
    const stimulus = summary('stimulus', t.maskOnsetPerfMs), mask = summary('mask', t.responseStartedAtPerfMs)
    t.timingFacts = { source: 'client_reported', stimulusFrameCount: stimulus.count, maskFrameCount: mask.count,
      stimulusMaxFrameGapMs: stimulus.maxGap, maskMaxFrameGapMs: mask.maxGap,
      incomplete: t.stimulusOnsetPerfMs === null || t.maskOnsetPerfMs === null || t.responseStartedAtPerfMs === null,
      overflow: this.overflow }
    this.stage = 'complete'
  }
  record(): EnumerationRecord {
    if (this.stage !== 'complete') throw Error('Cannot save an unfinished exposure')
    return structuredClone({ schemaVersion: 1, candidateId: ENUMERATION_IDENTITY.candidateId,
      contextId: this.context.contextId, attemptId: this.context.attemptId,
      exposureId: this.exposureId, exposureOrdinal: this.exposureOrdinal, artifactHash: this.artifactHash, core: this.core, stimulus: this.stimulus,
      raw: { clock: 'performance', onsetMeaning: 'client_reported_raf_draw_command_not_physical_onset',
        frames: this.frames, prematureEvents: this.prematureEvents, interactionOverflow: this.overflow,
        exposurePainted: this.frames.length > 0, completion: this.completion } })
  }
}
/** Draw commands run inside the same rAF callback that records the stage timestamp. */
export function drawEnumerationFrame(ctx: CanvasRenderingContext2D, capture: EnumerationCapture,
  artifact: EnumerationArtifact, fieldCssPx: number, dpr: number) {
  const recipe = artifact.context.recipe!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, fieldCssPx, fieldCssPx)
  ctx.fillStyle = recipe.fieldColor; ctx.fillRect(0, 0, fieldCssPx, fieldCssPx)
  if (capture.stage === 'fixation') {
    const center = fieldCssPx / 2, arm = Math.min(12, fieldCssPx / 12)
    ctx.strokeStyle = recipe.dotColor; ctx.lineWidth = 2; ctx.beginPath()
    ctx.moveTo(center - arm, center); ctx.lineTo(center + arm, center)
    ctx.moveTo(center, center - arm); ctx.lineTo(center, center + arm); ctx.stroke()
  } else if (capture.stage === 'stimulus') {
    ctx.fillStyle = recipe.dotColor
    for (const point of capture.stimulus.dots) {
      ctx.beginPath(); ctx.arc(point.x * fieldCssPx, point.y * fieldCssPx,
        capture.stimulus.dotDiameter * fieldCssPx / 2, 0, Math.PI * 2); ctx.fill()
    }
  } else if (capture.stage === 'mask') {
    const cellWidth = fieldCssPx / recipe.mask.columns, cellHeight = fieldCssPx / recipe.mask.rows
    for (let row = 0; row < recipe.mask.rows; row++) for (let column = 0; column < recipe.mask.columns; column++) {
      ctx.fillStyle = recipe.mask.values[artifact.maskBits[row * recipe.mask.columns + column]]
      ctx.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight)
    }
  }
}
