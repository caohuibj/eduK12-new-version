// Generated from the pure MOT candidate protocol. Source SHA256: bd79691a33a6680c220e170ef9e5fc210fca518ad7823f2c2c7fdca418c37da9
/** Pure task-owned MOT protocol. No runtime registration or product score. */
export type MotProfile = 'research' | 'experience'
export type MotSpeed = 1 | 4 | 8
export type MotInput = 'touch' | 'pointer' | 'keyboard'
export type MotPoint = { x: number; y: number }
export interface MotConfig {
  profile: MotProfile
  totalTrials: 45 | 9
  blocks: 3 | 1
  repetitionsPerSpeedPerBlock: 5 | 3
  fieldDeg: 12
  objectDiameterDeg: 1.2
  objectCount: 10
  targetCount: 5
  fixationMs: 500
  cueMs: 1000
  motionMs: 8000
  postMotionMs: 500
  maxFrameGapMs: 50
  durationToleranceMs: 50
  minimumMotionFrames: 200
}
export interface MotObject extends MotPoint { id: number; vx: number; vy: number }
export interface MotPlan {
  trialIndex: number
  blockIndex: number
  speed: MotSpeed
  targetIds: number[]
  objects: MotObject[]
}
export interface MotResponse extends MotPoint {
  objectId: number
  atPerfMs: number
  input: MotInput
}
export interface MotTrial {
  recordOrigin: 'live' | 'recovered_without_timing'
  phase: 'test'
  trialIndex: number
  blockIndex: number
  speed: MotSpeed
  targetIds: number[]
  initialObjects: MotObject[]
  startedAtPerfMs: number
  cueStartedAtPerfMs: number | null
  motionStartedAtPerfMs: number | null
  motionEndedAtPerfMs: number | null
  responseStartedAtPerfMs: number | null
  endedAtPerfMs: number
  completionTimeMs: number
  frameTiming: MotFrameSummary
  calibration: MotCalibration
  responses: MotResponse[]
  prematureInputs: number
  missedInputs: number
  ambiguousInputs: number
  interactionEvents: Array<{ type:'premature'|'miss'|'ambiguous'|'interruption'; atPerfMs:number; input:MotInput|null }>
  interactionOverflow: boolean
  interruptions: Array<'visibility_lost' | 'window_blur' | 'viewport_changed' | 'runner_restart'>
  timedOut: boolean
}
export interface MotFrameSummary {
  source: 'client_reported'
  frameCount: number
  firstMs: number | null
  lastMs: number | null
  maxGapMs: number | null
  strictlyIncreasing: boolean
  overflow: boolean
}
export interface MotCalibration {
  version: 1
  method: 'ruler_and_distance_self_reported'
  referenceMm: 50
  referenceCssPx: number
  viewingDistanceMm: number
  viewportWidthCssPx: number
  viewportHeightCssPx: number
  devicePixelRatio: number
  visualViewportScale: number
  language: 'zh' | 'en'
}
export const MOT_MAX_FRAMES = 3000
/** Computed incrementally in the client; full frame times go to the archive port only. */
export function summarizeMotFrames(times: readonly number[], overflow = false): MotFrameSummary {
  let maxGapMs: number | null = times.length > 1 ? 0 : null
  let strictlyIncreasing = true
  for (let i = 0; i < times.length; i++) {
    if (!Number.isFinite(times[i]) || times[i] < 0) strictlyIncreasing = false
    if (i) {
      const gap = times[i] - times[i - 1]
      if (gap <= 0) strictlyIncreasing = false
      maxGapMs = Math.max(maxGapMs ?? 0, gap)
    }
  }
  return { source: 'client_reported', frameCount: times.length,
    firstMs: times[0] ?? null, lastMs: times[times.length - 1] ?? null,
    maxGapMs, strictlyIncreasing, overflow }
}
/** Nominal planar visual-angle geometry, fixed across both profiles. Never auto-shrink. */
export function motGeometry(calibration: MotCalibration, availableWidth: number, availableHeight: number) {
  const values = [calibration.referenceCssPx, calibration.viewingDistanceMm, availableWidth, availableHeight]
  if (values.some(v => !Number.isFinite(v) || v <= 0)) throw new Error('Invalid MOT calibration')
  const mmPerCssPx = calibration.referenceMm / calibration.referenceCssPx
  const fieldCssPx = 2 * calibration.viewingDistanceMm * Math.tan(6 * Math.PI / 180) / mmPerCssPx
  return { fieldCssPx, objectCssPx: fieldCssPx / 10,
    fits: fieldCssPx + 2 <= availableWidth && fieldCssPx + 2 <= availableHeight }
}
export function motCalibrationMatches(a: MotCalibration, b: MotCalibration): boolean {
  return a.viewportWidthCssPx === b.viewportWidthCssPx && a.viewportHeightCssPx === b.viewportHeightCssPx
    && a.devicePixelRatio === b.devicePixelRatio && a.visualViewportScale === b.visualViewportScale
}
export const MOT_COLORS = Object.freeze({
  page: '#F8FAFC', surface: '#FFFFFF', text: '#1F2937', secondary: '#4B5563',
  action: '#1D4ED8', field: '#F2F2F2', boundary: '#64748B',
  object: '#222222', target: '#E53935', selected: '#1D4ED8', selectedMark: '#FFFFFF',
})
export const MOT_IDENTITY = Object.freeze({
  testType: 'mot', engineVersion: '1.1.0', scoringVersion: '1.1.0',
  configVersion: '1.0.0', randomizationAlgorithmVersion: 'mot-fnv1a-mulberry32-v1',
})
export function motConfig(profile: MotProfile): MotConfig {
  return {
    profile, totalTrials: profile === 'research' ? 45 : 9,
    blocks: profile === 'research' ? 3 : 1,
    repetitionsPerSpeedPerBlock: profile === 'research' ? 5 : 3,
    fieldDeg: 12, objectDiameterDeg: 1.2, objectCount: 10, targetCount: 5,
    fixationMs: 500, cueMs: 1000, motionMs: 8000, postMotionMs: 500,
    maxFrameGapMs: 50, durationToleranceMs: 50, minimumMotionFrames: 200,
  }
}
function rng(seed: string): () => number {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619)
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
export function motTrialPlan(config: MotConfig, seed: string, trialIndex: number, practice = false): MotPlan {
  if (!seed || seed.length > 256) throw new Error('MOT requires an existing bounded seed')
  if (!Number.isInteger(trialIndex) || trialIndex < 0 || trialIndex >= (practice ? 2 : config.totalTrials))
    throw new Error('MOT trial index is outside the frozen protocol')
  const perBlock = config.repetitionsPerSpeedPerBlock * 3
  const blockIndex = practice ? 0 : Math.floor(trialIndex / perBlock)
  const speeds: MotSpeed[] = [1, 4, 8]
  const order = shuffle(speeds.flatMap(speed => Array(config.repetitionsPerSpeedPerBlock).fill(speed)),
    rng(seed + ':conditions:' + blockIndex)) as MotSpeed[]
  const speed: MotSpeed = practice ? ([1, 4] as const)[trialIndex] : order[trialIndex % perBlock]
  const random = rng(seed + ':' + (practice ? 'practice' : 'formal') + ':' + trialIndex)
  const targetIds = shuffle(Array.from({ length: 10 }, (_, i) => i), random).slice(0, 5).sort((a,b) => a-b)
  const objects: MotObject[] = []
  const radius = config.objectDiameterDeg / 2
  for (let id = 0; id < 10; id++) {
    let point: MotPoint | null = null
    for (let attempt = 0; attempt < 10000; attempt++) {
      const p = { x: radius + random() * (config.fieldDeg - radius * 2),
        y: radius + random() * (config.fieldDeg - radius * 2) }
      if (objects.every(other => Math.hypot(other.x-p.x, other.y-p.y) >= config.objectDiameterDeg)) {
        point = p; break
      }
    }
    if (!point) throw new Error('MOT initial layout could not be generated')
    const angle = random() * Math.PI * 2
    objects.push({ id, ...point, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed })
  }
  return { trialIndex, blockIndex, speed, targetIds, objects }
}
function reflect(value: number, min: number, max: number): number {
  const span = max-min
  const p = ((value-min) % (span*2) + span*2) % (span*2)
  return min + (p <= span ? p : span*2-p)
}
/** Analytic time-based reflection: no 60Hz increment, no mutable PRNG during motion. */
export function motPosition(object: MotObject, elapsedMs: number, config: MotConfig): MotPoint {
  const seconds = Math.min(config.motionMs, Math.max(0, elapsedMs)) / 1000
  const r = config.objectDiameterDeg / 2
  return { x: reflect(object.x + object.vx*seconds, r, config.fieldDeg-r),
    y: reflect(object.y + object.vy*seconds, r, config.fieldDeg-r) }
}
export function motHitIds(plan: MotPlan, point: MotPoint, config: MotConfig, selected: number[] = []): number[] {
  return plan.objects.filter(object => {
    const p = motPosition(object, config.motionMs, config)
    return !selected.includes(object.id) && Math.hypot(p.x-point.x, p.y-point.y) <= config.objectDiameterDeg/2 + 1e-9
  }).map(o => o.id)
}
export interface MotPublicResult {
  quality: { state: 'interpretable' | 'limited' | 'invalid'; flags: Record<string, boolean>; reasons: string[] }
  metrics: Record<string, unknown>
}
export interface MotReportModel {
  state: 'interpretable' | 'limited' | 'invalid'
  headline: number | null
  rows: Array<{ speed: MotSpeed; mean: number; validTrials: number; totalTrials: number }>
  reasons: string[]
}
/** This projection is the only user-facing path; raw diagnostic metrics are never rendered directly. */
export function projectMotReport(result: MotPublicResult): MotReportModel {
  if (result.quality.state === 'invalid')
    return { state: 'invalid', headline: null, rows: [], reasons: [...result.quality.reasons] }
  const rows: MotReportModel['rows'] = []
  for (const speed of [1,4,8] as const) {
    if (result.quality.flags['unreliableSpeed' + speed] !== false) continue
    const mean = result.metrics['meanTargetsSpeed' + speed]
    const valid = result.metrics['validTrialsSpeed' + speed]
    const total = result.metrics['totalTrialsSpeed' + speed]
    if (typeof mean === 'number' && Number.isFinite(mean) && mean>=0 && mean<=5
      && typeof valid === 'number' && Number.isInteger(valid) && valid>0
      && typeof total === 'number' && Number.isInteger(total) && valid===total)
      rows.push({ speed, mean, validTrials: valid, totalTrials: total })
  }
  const value = result.metrics.meanTrackedTargets
  return { state: result.quality.state, headline: result.quality.state === 'interpretable' && rows.length===3
    && typeof value === 'number' && Number.isFinite(value) && value>=0 && value<=5 ? value : null,
    rows, reasons: [...result.quality.reasons] }
}
