import { z } from 'zod'
import { reportTemplateSchema, validateReportTemplateBindings } from './report-template'
import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { validateSituationRuntimeDefinition } from '../situational/situation-runtime-definition'

export const CONTENT_HASH_SCHEME = 'MEASUREMENT_CONTENT_CANONICAL_V1' as const
export const releaseLayer = z.enum(['MEASUREMENT', 'REFERENCE', 'REPORT'])
export const releaseFamily = z.enum(['SCALE', 'COGNITIVE', 'SJT'])
export const releaseStatus = z.enum(['PUBLISHED', 'SUPERSEDED', 'RETIRED', 'REVOKED'])
const text = z.string().trim().min(1).max(240)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const contentScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PRIVATE'), ownerId: text, product: z.enum(['TRAINING', 'SURVEY', 'SCHOOL', 'TEACHER']), resourceId: text }).strict(),
  z.object({ kind: z.literal('SHARED'), ownerId: text, product: z.enum(['TRAINING', 'SURVEY', 'SCHOOL', 'TEACHER']), resourceId: text }).strict(),
  z.object({ kind: z.literal('PLATFORM'), ownerId: text.optional() }).strict(),
])
export const assetReference = z.object({ assetId: text, sha256: digest, mediaType: text }).strict()
export const exactRelease = z.object({ releaseId: z.string().guid(), contentHash: digest }).strict()
const metric = z.object({ metricKey: text, unit: text, direction: text }).strict()
// Family adapters validate the executable definition with the existing authoritative
// schema/scorer/runner before calling this core. This is not a script interpreter.
export const measurementContent = z.object({
  projectionVersion: z.literal(1),
  instrumentVersion: text,
  measurementHash: digest,
  measurementHashScheme: text,
  scoringVersion: text,
  runnerKey: text,
  runnerVersion: text,
  locale: text,
  localizationVersion: text,
  resultMode: z.literal('UNSCORED').optional(),
  metrics: z.array(metric),
  executable: z.record(z.string(), z.unknown()),
}).strict().superRefine((content, ctx) => {
  if (content.resultMode === 'UNSCORED' ? content.metrics.length !== 0 : content.metrics.length === 0) ctx.addIssue({ code: 'custom', path: ['metrics'], message: 'Scored content requires metrics; explicitly unscored SJT forbids them' })
})
export const referenceContent = z.object({
  projectionVersion: z.literal(1),
  measurement: exactRelease,
  // Entries retain Reference Core kind/population/statistics/governance semantics.
  entries: z.array(z.object({
    metricKey: text,
    referenceKind: z.enum(['normative_distribution', 'criterion_threshold', 'descriptive_sample', 'theoretical_range']),
    definition: z.record(z.string(), z.unknown()),
  }).strict()).min(1),
  evidence: z.record(z.string(), z.unknown()),
}).strict()
export const reportContent = z.object({
  projectionVersion: z.literal(1),
  measurements: z.array(exactRelease).min(1),
  resultMode: z.literal('UNSCORED').optional(),
  metricKeys: z.array(text),
  audience: text,
  language: text,
  generatorVersion: text,
  // Text/layout only. Numeric reference rules belong to reference releases.
  template: reportTemplateSchema,
}).strict().superRefine((content, ctx) => {
  if (content.resultMode === 'UNSCORED') {
    if (content.metricKeys.length || content.measurements.length !== 1 || content.template.blocks.some(block => block.type !== 'TEXT')) ctx.addIssue({ code: 'custom', message: 'Unscored reports require one measurement, text only and no metric keys' })
  } else if (!content.metricKeys.length) ctx.addIssue({ code: 'custom', path: ['metricKeys'], message: 'Scored reports require metric keys' })
})
const common = {
  family: releaseFamily, key: text, version: text, scope: contentScope,
  assetRefs: z.array(assetReference).max(1000),
  sourceReleaseId: z.string().guid().nullable(),
  provenance: z.record(z.string(), z.unknown()).default({}),
}
export const releaseInputSchema = z.discriminatedUnion('layer', [
  z.object({ ...common, layer: z.literal('MEASUREMENT'), content: measurementContent }).strict(),
  z.object({ ...common, layer: z.literal('REFERENCE'), content: referenceContent }).strict(),
  z.object({ ...common, layer: z.literal('REPORT'), content: reportContent }).strict(),
])
export type ReleaseInput = z.infer<typeof releaseInputSchema>
export type ReleaseStatus = z.infer<typeof releaseStatus>
export type PreparedRelease = ReleaseInput & { hashScheme: typeof CONTENT_HASH_SCHEME; contentHash: string }

export class ContentReleaseError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ContentReleaseError' }
}

export function prepareRelease(input: unknown): PreparedRelease {
  const value = releaseInputSchema.parse(input)
  if (value.layer === 'REPORT' && value.content.resultMode === 'UNSCORED' && value.family !== 'SJT') throw new ContentReleaseError('CONTENT_UNSCORED_FAMILY_INVALID')
  if (value.layer === 'MEASUREMENT' && value.family === 'SJT'
    && (value.content.executable.scoring as { mode?: string } | undefined)?.mode === 'UNSCORED'
    && value.content.resultMode !== 'UNSCORED') throw new ContentReleaseError('CONTENT_UNSCORED_MODE_REQUIRED')
  if (value.layer === 'MEASUREMENT' && value.content.resultMode === 'UNSCORED') {
    if (value.family !== 'SJT' || value.content.runnerKey !== 'situational-v2') throw new ContentReleaseError('CONTENT_UNSCORED_FAMILY_INVALID')
    // The core rechecks the adapter's claim. Report/source metadata are not part
    // of measurement identity; reconstruct only a neutral validation envelope.
    const e = value.content.executable
    const scenes = Array.isArray(e.scenes) ? e.scenes : []
    const fragments = scenes.flatMap((scene: any) => (Array.isArray(scene?.channels) ? scene.channels : []).flatMap((channel: any) => (Array.isArray(channel?.options) ? channel.options : []).map((option: any) => ({ sceneKey: scene.sceneKey, channelKey: channel.channelKey, optionKey: option.optionKey, text: option.label, kind: 'ACTION' }))))
    const checked = validateSituationRuntimeDefinition({ ...e, source: {}, license: { status: 'unknown', redistribution: 'unknown' }, referencePolicy: { type: 'none' }, report: {
      reportVersion: 'unscored-projection-validation-v1', primaryMetricKeys: [], metricOrder: [], interpretations: [], limitations: [], disclaimer: 'Unscored selected-action evidence only.', narrative: { version: 'sjt-narrative-v1', fragments, comparisons: [] },
    } })
    if (!checked.definition || checked.definition.scoring.mode !== 'UNSCORED' || checked.issues.some(issue => issue.severity === 'error')) throw new ContentReleaseError('CONTENT_SJT_DEFINITION_INVALID')
  }
  const assetRefs = [...value.assetRefs].sort((a, b) => a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0)
  if (new Set(assetRefs.map(a => a.assetId)).size !== assetRefs.length) throw new ContentReleaseError('CONTENT_ASSET_DUPLICATE')
  if (value.layer === 'MEASUREMENT' && new Set(value.content.metrics.map(m => m.metricKey)).size !== value.content.metrics.length) {
    throw new ContentReleaseError('CONTENT_METRIC_DUPLICATE')
  }
  if (value.layer === 'REPORT' && new Set(value.content.metricKeys).size !== value.content.metricKeys.length) {
    throw new ContentReleaseError('CONTENT_METRIC_DUPLICATE')
  }
  if(value.layer==='REPORT')validateReportTemplateBindings(value.content.template,value.content.metricKeys,assetRefs.map(a=>a.assetId))
  // Explicit layer projection: identity, ownership, catalog and lifecycle never
  // change scientific contentHash. Scope/provenance are still immutable in storage.
  const contentHash = canonicalHash({ hashScheme: CONTENT_HASH_SCHEME, family: value.family, layer: value.layer, content: value.content, assetRefs })
  // Reject undefined/function/non-finite/circular/non-JSON payloads, including source.
  canonicalJsonString(value)
  return { ...value, assetRefs, hashScheme: CONTENT_HASH_SCHEME, contentHash }
}

export function assertReleaseTransition(from: ReleaseStatus, to: ReleaseStatus): void {
  const allowed: Record<ReleaseStatus, readonly ReleaseStatus[]> = {
    PUBLISHED: ['SUPERSEDED', 'RETIRED', 'REVOKED'],
    SUPERSEDED: ['RETIRED', 'REVOKED'],
    RETIRED: ['REVOKED'],
    REVOKED: [],
  }
  if (!allowed[from].includes(to)) throw new ContentReleaseError('CONTENT_LIFECYCLE_INVALID')
}

export function assertReleaseReadable(status: ReleaseStatus, purpose: 'NEW_BINDING' | 'HISTORY' | 'REINTERPRETATION'): void {
  if (purpose === 'NEW_BINDING' && status !== 'PUBLISHED') throw new ContentReleaseError('CONTENT_NOT_SELECTABLE')
  if (purpose === 'REINTERPRETATION' && status === 'REVOKED') throw new ContentReleaseError('CONTENT_REVOKED')
  // HISTORY preserves the original artifact plus a separate revocation notice.
  // This does not authorize access to personal facts; caller checks current access.
}

/** Publishing a correction for frozen historical facts must not reopen delivery. */
export function assertMeasurementDependency(status: ReleaseStatus, purpose: 'NEW_ADMINISTRATION' | 'HISTORICAL_INTERPRETATION'): void {
  assertReleaseReadable(status, purpose === 'NEW_ADMINISTRATION' ? 'NEW_BINDING' : 'REINTERPRETATION')
}
