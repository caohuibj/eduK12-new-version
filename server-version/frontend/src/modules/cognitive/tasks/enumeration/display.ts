import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { enumerationConfig, enumerationPlan, enumerationRecipeConfig, enumerationRecipePlan, enumerationConfigEqual, type EnumerationConfig, type EnumerationRecipeConfig, type EnumerationPlan } from './generated/protocol'
export interface EnumerationCalibration {
  id: string
  source: 'self_reported_ruler_and_distance' | 'synthetic_fixture'
  referenceMm: number
  referenceCssPx: number
  viewingDistanceMm: number
  viewportWidthCssPx: number
  viewportHeightCssPx: number
  devicePixelRatio: number
  visualViewportScale: number
}
/** Host-supplied proposal, never a task default or approval of physical timing/luminance. */
export interface EnumerationRecipe {
  id: string
  source: 'host_reviewed_candidate' | 'synthetic_fixture'
  status: 'CANDIDATE_RECIPE_NOT_VALIDATED'
  fieldShape: 'square_background_circular_sampling_proposal'
  fieldDiameterDeg: 5
  dotDiameterDeg: 0.5
  fieldColor: '#808080'
  dotColor: '#FFFFFF'
  mask: { rows: 48; columns: 48; values: ['#141414', '#EBEBEB']; seed: 20261026;
    algorithm: 'lcg1664525-1013904223-u32-topbit'; scope: 'session_fixed' }
  fixationMs: number
  formalExposureMs: number
  practiceExposureMs: number
  maskMs: number
}
interface EnumerationContextBase {
  contextId: string
  attemptId: string
  randomSeed: string
  language: 'zh' | 'en'
  calibration: EnumerationCalibration | null
  recipe: EnumerationRecipe | null
}
/** The native variant is fed by an authorized frozen session, never a scope-string authorization. */
export type EnumerationContext = EnumerationContextBase & (
  { usage: 'INTERNAL_REVIEW_ONLY'; config: EnumerationConfig } |
  { usage: 'AUTHENTICATED_CONTENT_CANDIDATE'; config: EnumerationRecipeConfig }
)
export function enumerationContextPlan(c: EnumerationContext, index: number, phase: 'test' | 'practice' = 'test'): EnumerationPlan {
  return c.usage === 'AUTHENTICATED_CONTENT_CANDIDATE'
    ? enumerationRecipePlan(c.config, c.randomSeed, index, phase)
    : enumerationPlan(c.config, c.randomSeed, index, phase)
}
const boundedId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
export function validateEnumerationContext(c: EnumerationContext): void {
  if (!boundedId(c.contextId) || !boundedId(c.attemptId) || !['INTERNAL_REVIEW_ONLY', 'AUTHENTICATED_CONTENT_CANDIDATE'].includes(c.usage)
    || !['zh', 'en'].includes(c.language)) throw Error('Invalid internal enumeration context')
  const expected = c.usage === 'AUTHENTICATED_CONTENT_CANDIDATE'
    ? enumerationRecipeConfig(c.config.profile) : enumerationConfig(c.config.profile)
  if (!enumerationConfigEqual(c.config, expected)) throw Error('Unsupported enumeration config tuple')
  enumerationContextPlan(c, 0)
  if (c.usage === 'AUTHENTICATED_CONTENT_CANDIDATE'
    && ((c.recipe !== null && !enumerationConfigEqual(c.recipe, c.config.stimulusRecipe))
      || c.calibration?.source === 'synthetic_fixture')) throw Error('Native enumeration requires its frozen recipe and self-reported calibration')
  if (c.calibration) {
    const a = c.calibration
    if (!boundedId(a.id) || !['self_reported_ruler_and_distance', 'synthetic_fixture'].includes(a.source)
      || ![a.referenceMm, a.referenceCssPx, a.viewingDistanceMm, a.viewportWidthCssPx,
        a.viewportHeightCssPx, a.devicePixelRatio, a.visualViewportScale].every(positive))
      throw Error('Invalid explicit calibration')
  }
  if (c.recipe) {
    const r = c.recipe
    if (!boundedId(r.id) || !['host_reviewed_candidate', 'synthetic_fixture'].includes(r.source)
      || r.status !== 'CANDIDATE_RECIPE_NOT_VALIDATED' || r.fieldShape !== 'square_background_circular_sampling_proposal'
      || r.fieldDiameterDeg !== 5 || r.dotDiameterDeg !== 0.5 || r.fieldColor !== '#808080' || r.dotColor !== '#FFFFFF'
      || r.mask.rows !== 48 || r.mask.columns !== 48 || r.mask.seed !== 20261026
      || r.mask.algorithm !== 'lcg1664525-1013904223-u32-topbit' || r.mask.scope !== 'session_fixed'
      || !Array.isArray(r.mask.values) || r.mask.values.length !== 2
      || r.mask.values[0] !== '#141414' || r.mask.values[1] !== '#EBEBEB'
      || r.fixationMs !== 1000 || r.formalExposureMs !== 50 || r.practiceExposureMs !== 1000 || r.maskMs !== 1000)
      throw Error('Invalid explicit candidate recipe')
  }
}
export interface EnumerationViewport { width: number; height: number; dpr: number; scale: number }
export function readEnumerationViewport(): EnumerationViewport {
  return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio,
    scale: window.visualViewport?.scale ?? 1 }
}
export function enumerationGeometry(calibration: EnumerationCalibration, recipe: EnumerationRecipe) {
  const cssPerMm = calibration.referenceCssPx / calibration.referenceMm
  const span = (degrees: number) => 2 * calibration.viewingDistanceMm * Math.tan(degrees * Math.PI / 360) * cssPerMm
  return { fieldCssPx: span(recipe.fieldDiameterDeg), dotCssPx: span(recipe.dotDiameterDeg) }
}
export function enumerationStartBlock(context: EnumerationContext, viewport: EnumerationViewport, availableWidth: number, availableHeight: number): string | null {
  try { validateEnumerationContext(context) } catch { return 'invalid_context' }
  if (!context.calibration) return 'missing_calibration'
  if (!context.recipe) return 'missing_recipe'
  const a = context.calibration
  if (viewport.width !== a.viewportWidthCssPx || viewport.height !== a.viewportHeightCssPx
    || viewport.dpr !== a.devicePixelRatio || viewport.scale !== a.visualViewportScale) return 'display_changed'
  const { fieldCssPx, dotCssPx } = enumerationGeometry(a, context.recipe)
  if (Math.ceil(fieldCssPx * viewport.dpr) > 4096) return 'canvas_budget_exceeded'
  if (![fieldCssPx, dotCssPx, availableWidth, availableHeight].every(positive)
    || fieldCssPx + 2 > availableWidth || fieldCssPx + 2 > availableHeight) return 'field_does_not_fit'
  return null
}
function randomFor(seed: string) {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619)
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export interface EnumerationStimulus {
  algorithm: 'enumeration-circular-rejection-binary-grid-v1'
  seed: string
  dots: Array<{ x: number; y: number }>
  /** Normalized against field diameter; physical interpretation still requires valid host calibration. */
  dotDiameter: number
}
export function enumerationStimulus(context: EnumerationContext, plan: EnumerationPlan, exposureId: string): EnumerationStimulus {
  validateEnumerationContext(context)
  if (!context.recipe || !context.calibration || !boundedId(exposureId)) throw Error('Missing explicit stimulus inputs')
  const recipe = context.recipe, geometry = enumerationGeometry(context.calibration, recipe)
  const dotDiameter = geometry.dotCssPx / geometry.fieldCssPx
  if (!positive(dotDiameter) || dotDiameter >= 1) throw Error('Invalid dot geometry')
  const seed = JSON.stringify([context.randomSeed, recipe.id, plan.phase, plan.trialIndex, exposureId])
  const random = randomFor(seed + ':dots'), dots: EnumerationStimulus['dots'] = []
  for (let i = 0; i < plan.targetValue; i++) {
    let point: { x: number; y: number } | null = null
    for (let attempt = 0; attempt < 10000; attempt++) {
      const radius = Math.sqrt(random()) * (0.5 - dotDiameter / 2), theta = random() * 2 * Math.PI
      const p = { x: 0.5 + Math.cos(theta) * radius, y: 0.5 + Math.sin(theta) * radius }
      if (dots.every(other => Math.hypot(p.x - other.x, p.y - other.y) >= dotDiameter)) { point = p; break }
    }
    if (!point) throw Error('Candidate dot layout could not be generated')
    dots.push(point)
  }
  return { algorithm: 'enumeration-circular-rejection-binary-grid-v1', seed, dots, dotDiameter }
}

export const enumerationDigest = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))))
export interface EnumerationPageOrigin {
  timeOrigin: number
  pageInstanceId: string
  source: 'performance.timeOrigin-and-crypto.randomUUID'
}
let pageOrigin: EnumerationPageOrigin | null = null
export function enumerationPageOrigin(): EnumerationPageOrigin {
  if (!pageOrigin) {
    if (!Number.isFinite(performance.timeOrigin) || performance.timeOrigin < 0 || !globalThis.crypto?.randomUUID)
      throw Error('Actual page clock origin is unavailable')
    pageOrigin = { timeOrigin: performance.timeOrigin, pageInstanceId: crypto.randomUUID(),
      source: 'performance.timeOrigin-and-crypto.randomUUID' }
  }
  return { ...pageOrigin }
}
export interface EnumerationArtifact {
  schemaVersion: 1
  hashScheme: 'candidate-json-stringify-sha256-v1'
  artifactHash: string
  pageOrigin: EnumerationPageOrigin
  context: EnumerationContext
  maskBits: number[]
}
/** Store once per context; each trial references artifactHash rather than copying the fixed mask. */
export function enumerationArtifact(context: EnumerationContext): EnumerationArtifact {
  validateEnumerationContext(context)
  if (!context.recipe || !context.calibration) throw Error('Missing explicit artifact inputs')
  let state: number = context.recipe.mask.seed
  const maskBits = Array.from({ length: 2304 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state >>> 31
  })
  const payload = { schemaVersion: 1 as const, hashScheme: 'candidate-json-stringify-sha256-v1' as const,
    context: structuredClone(context), pageOrigin: enumerationPageOrigin(), maskBits }
  return { ...payload, artifactHash: enumerationDigest(payload) }
}
