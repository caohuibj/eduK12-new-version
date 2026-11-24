import { canonicalHash } from './canonical'
import { COMPACT_FIELD_MAX_BYTES, decryptCompactField, encryptCompactField } from './compact-field-codec'
import { publicTemplates, type PublicTemplateKind, type PublicTemplateStore } from './public-templates'
import { SCALE_REPORT_FACTS_VIEW } from './compact-scale-facts'
import { parseScaleResultV2, type ScaleResultV2 } from '../scale/scale-result'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from './unit-result'
import {
  compositeFinalFactsSchema,
  compositeFinalRawSchema,
  compositeUnitSeedsSchema,
  type CompactItemTuple,
  type CompositeFinalFactsV1,
  type CompositeFinalRawV1,
  type CompositeScaleUnitFactV1,
  type CompositeScaleUnitRawV1,
  type CompositeUnitSeedsV1,
  type HydratedScaleUnitResult,
} from './composite-final.contract'

const MAX_FINAL_FACTS_BYTES = COMPACT_FIELD_MAX_BYTES
const MAX_FINAL_RAW_BYTES = COMPACT_FIELD_MAX_BYTES

const scoreStatic = ['key', 'type', 'label', 'description', 'direction', 'canonical', 'displayPrecision', 'range', 'expectedItems'] as const
const methodStatic = ['scaleId', 'instrumentVersion', 'scoringVersion', 'reportVersion', 'reportAudience', 'localizationVersion', 'definitionHash', 'referenceVersions'] as const
const referenceStatic = ['scoreKey', 'referenceVersion', 'referenceKind', 'evidenceLevel', 'label', 'mean', 'sd', 'bandProvenance', 'source', 'population', 'instrumentVersion', 'scoringVersion', 'limitations', 'disclaimer'] as const
const interpretationStatic = ['scoreKey', 'headline', 'label', 'interpretation', 'guidance', 'limitations', 'referenceVersion'] as const
const resultKeys = ['schemaVersion', 'instrument', 'method', 'quality', 'itemScores', 'scores', 'references', 'interpretations', 'caveats', 'disclaimer'] as const
const itemRawKeys = ['responseTimeMs', 'answeredAt', 'changeCount'] as const
const itemKeys = ['itemCode', 'responseValue', 'baseScore', 'score', ...itemRawKeys] as const

const pick = (value: any, keys: readonly string[]) =>
  Object.fromEntries(keys.filter(k => Object.prototype.hasOwnProperty.call(value, k)).map(k => [k, value[k]]))
const omit = (value: any, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const same = (a: unknown, b: unknown) =>
  a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' && canonicalHash(a) === canonicalHash(b))
const at = (value: any, path: Array<string | number>): any =>
  path.reduce((current, key) => (current == null ? null : current[key] ?? null), value)
const isNibbleInt = (v: number): boolean => Number.isInteger(v) && v >= 0 && v <= 15
const isEmptyObj = (value: Record<string, unknown> | undefined | null): boolean =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0

const verifiedBases = new WeakSet<object>()

type Graph = any[]
const encodeCanonicalGraph = (
  envelope: CanonicalUnitResultEnvelopeV1,
  result: ScaleResultV2,
): { graph: Graph; values: unknown[] } => {
  const values: unknown[] = []
  const personal = (value: unknown): Graph => { const index = values.length; values.push(value); return [4, index] }
  const link = (value: unknown, path: Array<string | number>): Graph => same(value, at(result, path)) ? [3, path] : personal(value)
  const visit = (value: any, path: Array<string | number>): Graph => {
    const where = path.join('.')
    const meta = ['resultHash', 'bundleBridgeHash', 'completedAt', 'persistenceProvenance', 'bundleBridge.sourceResultHash'].indexOf(where)
    if (meta >= 0) return [5, meta]
    if (where === 'bundleBridge.rawScoreFeedback') return link(value, ['rawScoreFeedback'])
    if (where === 'core.quality') return link(value, ['quality'])
    if (where === 'core.contextHash') return link(value, ['method', 'assessmentContext', 'snapshotHash'])
    if (/^core\.metrics\.[0-9]+\.(value|quality)$/.test(where)) {
      const metric = envelope.core.metrics[path[2] as number]
      const index = result.scores.findIndex(s => s.key === metric.key)
      if (index < 0) throw new Error('Canonical metric is not in scale result')
      return link(value, ['scores', index, path[3] === 'value' ? 'value' : 'status'])
    }
    if (/^core\.references\.[0-9]+\.(value|z|percentile|classification|status)$/.test(where)) {
      const ref = envelope.core.references[path[2] as number]
      const index = result.references.findIndex(r => r.referenceVersion === ref.referenceVersion && (!ref.scoreKey || r.scoreKey === ref.scoreKey))
      if (index >= 0) {
        const field = path[3]
        return link(value, ['references', index, ...(field === 'percentile' ? ['percentile', 'value'] : field === 'classification' ? ['criterionBand', 'key'] : [field])])
      }
      return personal(value)
    }
    if (/^bundleBridge\.scores\.[0-9]+\.(value|status|criterionBandKey)$/.test(where)) {
      const score = envelope.bundleBridge!.scores![path[2] as number]
      const index = result.scores.findIndex(s => s.key === score.scoreKey)
      if (index < 0) throw new Error('Bundle metric is not in scale result')
      if (path[3] !== 'criterionBandKey') return link(value, ['scores', index, path[3]])
      const refIndex = result.references.findIndex(r => r.scoreKey === score.scoreKey && r.status === 'available' && r.referenceKind === 'criterion_threshold')
      return refIndex < 0 ? personal(value) : link(value, ['references', refIndex, 'criterionBand', 'key'])
    }
    if (where === 'core.facts') return personal(value)
    if (value === null || typeof value !== 'object') return [0, value]
    if (Array.isArray(value)) return [1, value.map((v, i) => visit(v, [...path, i]))]
    return [2, Object.entries(value).map(([k, v]) => [k, visit(v, [...path, k])])]
  }
  return { graph: visit(envelope, []), values }
}

const decodeCanonicalGraph = (node: Graph, result: ScaleResultV2, values: unknown[], metadata: unknown[], depth = 0): any => {
  if (!Array.isArray(node) || node.length !== 2 || depth > 64) throw new Error('Invalid canonical view graph')
  switch (node[0]) {
    case 0: if (node[1] !== null && !['string', 'number', 'boolean'].includes(typeof node[1])) throw new Error('Invalid graph constant'); return node[1]
    case 1: if (!Array.isArray(node[1])) throw new Error('Invalid graph array'); return node[1].map((v: Graph) => decodeCanonicalGraph(v, result, values, metadata, depth + 1))
    case 2: if (!Array.isArray(node[1])) throw new Error('Invalid graph record'); return Object.fromEntries(node[1].map(([k, v]: [string, Graph]) => { if (typeof k !== 'string') throw new Error('Invalid graph key'); return [k, decodeCanonicalGraph(v, result, values, metadata, depth + 1)] }))
    case 3: if (!Array.isArray(node[1]) || node[1].some((x: unknown) => typeof x !== 'string' && !Number.isSafeInteger(x))) throw new Error('Invalid graph path'); return plain(at(result, node[1]))
    case 4: if (!Number.isSafeInteger(node[1]) || node[1] < 0 || node[1] >= values.length) throw new Error('Invalid graph personal index'); return plain(values[node[1]])
    case 5: if (!Number.isInteger(node[1]) || node[1] < 0 || node[1] >= metadata.length) throw new Error('Invalid graph metadata reference'); return plain(metadata[node[1]])
    default: throw new Error('Invalid graph opcode')
  }
}

export interface BuildScaleUnitFactInput {
  itemId: string
  scaleId: string
  sourceDefinitionHash: string
  itemOrder: string[]
  result: ScaleResultV2
  canonical?: CanonicalUnitResultEnvelopeV1 | null
}

/** Batch-packs one or more scored scales into compact CompositeScaleUnitFactV1
 * entries using a SINGLE public_templates.saveMany roundtrip. */
export async function buildScaleUnitFactsBatch(
  inputs: readonly BuildScaleUnitFactInput[],
  templates: PublicTemplateStore = publicTemplates,
): Promise<CompositeScaleUnitFactV1[]> {
  if (!inputs.length) return []
  const fragments: Array<{ kind: PublicTemplateKind; value: unknown }> = []
  const add = (kind: PublicTemplateKind, value: unknown) => {
    const idx = fragments.length
    fragments.push({ kind, value })
    return idx
  }

  const plans = inputs.map(input => {
    if (new Set(input.itemOrder).size !== input.itemOrder.length) {
      throw new Error('Duplicate frozen scale question identity')
    }
    const { result } = input
    const baseValue = {
      schemaVersion: 2,
      instrument: result.instrument,
      method: pick(result.method, methodStatic),
      scores: result.scores.map(s => pick(s, scoreStatic)),
      itemOrder: input.itemOrder,
      disclaimer: result.disclaimer,
    }
    const canonical = input.canonical
      ? encodeCanonicalGraph(parseCanonicalUnitResultEnvelope(input.canonical), result)
      : null
    const bundleIdx = add('SCALE_FACTS_BUNDLE', {
      base: baseValue,
      caveats: result.caveats,
      canonical: canonical ? canonical.graph : null,
    })
    const refIndices = result.references.map(ref => ({
      base: add('SCALE_REFERENCE', { kind: 'REFERENCE', value: pick(ref, referenceStatic) }),
      band: ref.criterionBand == null ? null : add('SCALE_REFERENCE', { kind: 'BAND', value: ref.criterionBand }),
    }))
    const interpIndices = result.interpretations.map(x => add('SCALE_INTERPRETATION', pick(x, interpretationStatic)))
    return { input, canonical, bundleIdx, refIndices, interpIndices }
  })

  const hashes = await templates.saveMany(fragments)

  return plans.map(({ input, canonical, bundleIdx, refIndices, interpIndices }) => {
    const { result } = input
    const itemPositions = new Map(input.itemOrder.map((code, index) => [code, index]))
    const itemTuples: CompactItemTuple[] = result.itemScores.map(item => {
      const index = itemPositions.get(item.itemCode)
      if (index === undefined) throw new Error('Scored item is outside frozen form')
      let mask = 0
      itemRawKeys.forEach((key, i) => {
        if (Object.prototype.hasOwnProperty.call(item, key)) mask |= 1 << i
      })
      return [index, item.baseScore, item.score, mask, omit(item, itemKeys)]
    })

    const canFastPackItems = itemTuples.length > 0 && itemTuples.every(
      (row, i) => row[0] === i && row[3] === 0 && isEmptyObj(row[4]) && isNibbleInt(row[1]) && isNibbleInt(row[2]),
    )
    let itemsPacked: string | undefined
    if (canFastPackItems) {
      const buf = Buffer.allocUnsafe(itemTuples.length)
      for (let i = 0; i < itemTuples.length; i++) {
        buf[i] = ((itemTuples[i][1] & 0xf) << 4) | (itemTuples[i][2] & 0xf)
      }
      itemsPacked = buf.toString('base64')
    }

    const extras = omit(result, resultKeys)
    const methodExtras = omit(result.method, [...methodStatic, 'assessmentContext'])

    return {
      unitType: 'SCALE',
      itemId: input.itemId,
      scaleId: input.scaleId,
      sourceDefinitionHash: input.sourceDefinitionHash,
      sourceResultHash: input.canonical?.bundleBridge?.sourceResultHash ?? canonicalHash(result),
      ...(input.canonical?.core.compiledRuntimeHash ? { compiledRuntimeHash: input.canonical.core.compiledRuntimeHash } : {}),
      bundleHash: hashes[bundleIdx],
      scores: result.scores.map(score => {
        const indices = score.answeredItems.map(code => {
          const idx = score.expectedItems.indexOf(code)
          if (idx < 0) throw new Error('Answered item is outside frozen score')
          return idx
        })
        const full = score.answeredItems.length === score.expectedItems.length && indices.every((v, i) => v === i)
        return [
          score.value,
          score.status,
          score.prorated,
          full ? null : indices,
          omit(score, [...scoreStatic, 'value', 'status', 'prorated', 'answeredItems']),
        ]
      }),
      quality: result.quality,
      ...(itemsPacked !== undefined ? { itemsPacked } : { items: itemTuples }),
      references: result.references.map((ref, i) => ({
        base: hashes[refIndices[i].base],
        band: refIndices[i].band === null ? null : hashes[refIndices[i].band!],
        hasBand: Object.prototype.hasOwnProperty.call(ref, 'criterionBand'),
        dynamic: omit(ref, [...referenceStatic, 'criterionBand']),
      })),
      interpretations: result.interpretations.map((v, i) => ({
        template: hashes[interpIndices[i]],
        extras: omit(v, interpretationStatic),
      })),
      ...(!isEmptyObj(extras) ? { extras } : {}),
      ...(!isEmptyObj(methodExtras) ? { methodExtras } : {}),
      ...(canonical && canonical.values.length > 0 ? { canonicalValues: canonical.values } : {}),
      ...(input.canonical ? { canonicalResultHash: input.canonical.resultHash } : {}),
    }
  })
}

export function collectScaleUnitFactTemplateRequests(
  facts: readonly CompositeScaleUnitFactV1[],
): Array<{ hash: string; kind: PublicTemplateKind }> {
  const seen = new Set<string>()
  const requests: Array<{ hash: string; kind: PublicTemplateKind }> = []
  const push = (hash: string, kind: PublicTemplateKind) => {
    const key = `${kind}:${hash}`
    if (!seen.has(key)) {
      seen.add(key)
      requests.push({ hash, kind })
    }
  }
  for (const f of facts) {
    push(f.bundleHash, 'SCALE_FACTS_BUNDLE')
    for (const ref of f.references) {
      push(ref.base, 'SCALE_REFERENCE')
      if (ref.band) push(ref.band, 'SCALE_REFERENCE')
    }
    for (const interp of f.interpretations) push(interp.template, 'SCALE_INTERPRETATION')
  }
  return requests
}

export async function hydrateScaleUnitFact(
  fact: CompositeScaleUnitFactV1,
  context: {
    attemptId: string
    submissionId?: string
    completedAt: string
    contextHash: string | null
    raw?: CompositeScaleUnitRawV1
    full?: boolean
    canonical?: boolean
    reportOnly?: boolean
  },
  templates: PublicTemplateStore = publicTemplates,
): Promise<HydratedScaleUnitResult> {
  if (context.reportOnly && (context.full || context.canonical !== false)) {
    throw new Error('Report view requires a narrow result request')
  }
  const requests: Array<{ hash: string; kind: PublicTemplateKind }> = [
    { hash: fact.bundleHash, kind: 'SCALE_FACTS_BUNDLE' },
  ]
  for (const ref of fact.references) {
    requests.push({ hash: ref.base, kind: 'SCALE_REFERENCE' })
    if (ref.band) requests.push({ hash: ref.band, kind: 'SCALE_REFERENCE' })
  }
  for (const interp of fact.interpretations) {
    requests.push({ hash: interp.template, kind: 'SCALE_INTERPRETATION' })
  }

  const loaded = await templates.loadMany(requests)
  let cursor = 0
  const bundle = loaded[cursor++]
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new Error('Invalid composite scale facts bundle')
  }
  const { base, caveats, canonical: canonicalGraph } = bundle
  if (!base || base.schemaVersion !== 2 || !Array.isArray(base.scores)
    || base.scores.length !== fact.scores.length || !Array.isArray(base.itemOrder)) {
    throw new Error('Invalid composite scale base template')
  }
  if (!verifiedBases.has(base)) {
    parseScaleResultV2({
      schemaVersion: 2,
      instrument: base.instrument,
      method: { ...base.method, assessmentContext: null },
      quality: { status: 'interpretable', flags: [] },
      itemScores: [],
      scores: base.scores.map((meta: any) => ({ ...meta, value: 0, status: 'calculated', prorated: false, answeredItems: meta.expectedItems })),
      references: [],
      interpretations: [],
      caveats: [],
      disclaimer: base.disclaimer,
    })
    verifiedBases.add(base)
  }

  const references = fact.references.map(ref => {
    const template = loaded[cursor++]
    if (template.kind !== 'REFERENCE') throw new Error('Invalid scale reference template')
    let band = null
    if (ref.band) {
      const b = loaded[cursor++]
      if (b.kind !== 'BAND') throw new Error('Invalid scale band template')
      band = b.value
    }
    return { ...template.value, ...ref.dynamic, ...(ref.hasBand ? { criterionBand: band } : {}) }
  })
  const interpretations = fact.interpretations.map(ref => ({ ...loaded[cursor++], ...ref.extras }))

  const scores = fact.scores.map((row, i) => {
    const meta = base.scores[i]
    const expected = meta.expectedItems
    const answered = row[3] === null
      ? [...expected]
      : row[3].map(idx => {
        if (!Number.isSafeInteger(idx) || idx < 0 || idx >= expected.length) throw new Error('Invalid answered item reference')
        return expected[idx]
      })
    return { ...meta, value: row[0], status: row[1], prorated: row[2], answeredItems: answered, ...row[4] }
  })

  const canonicalScores = scores.filter(score => score.canonical)
  const expectedQuality = canonicalScores.some(s => s.status === 'not_calculable')
    ? 'invalid'
    : canonicalScores.some(s => s.status === 'limited')
      ? 'limited'
      : 'interpretable'
  if (expectedQuality !== fact.quality.status) throw new Error('Composite scale quality mismatch')
  if (scores.some(s => (s.status === 'not_calculable') !== (s.value === null))) throw new Error('Composite scale score status mismatch')

  const assessmentContext = context.contextHash ? { schemaVersion: 1 as const, snapshotHash: context.contextHash } : null
  const result = {
    ...(fact.extras ?? {}),
    schemaVersion: 2,
    instrument: base.instrument,
    method: { ...base.method, ...(fact.methodExtras ?? {}), assessmentContext },
    quality: fact.quality,
    itemScores: [],
    scores,
    references,
    interpretations,
    caveats,
    disclaimer: base.disclaimer,
  } as ScaleResultV2

  const rawAnswerMap = new Map<string, { responseValue: string | number; timing?: Record<string, unknown> }>()
  if (context.raw) {
    for (let i = 0; i < context.raw.codes.length; i++) {
      const code = context.raw.codes[i]
      const timing = context.raw.timings?.[code] as Record<string, unknown> | undefined
      rawAnswerMap.set(code, { responseValue: context.raw.values[i], timing })
    }
  }

  let itemTuples: CompactItemTuple[]
  if (context.reportOnly) {
    itemTuples = []
  } else if (fact.itemsPacked !== undefined) {
    const buf = Buffer.from(fact.itemsPacked, 'base64')
    if (buf.toString('base64') !== fact.itemsPacked || buf.length > base.itemOrder.length) {
      throw new Error('Invalid packed scale items')
    }
    itemTuples = new Array(buf.length)
    for (let i = 0; i < buf.length; i++) {
      itemTuples[i] = [i, (buf[i] >> 4) & 0xf, buf[i] & 0xf, 0, {}]
    }
  } else {
    itemTuples = fact.items ?? []
  }

  const seen = new Set<number>()
  result.itemScores = context.reportOnly ? [] : itemTuples.map(row => {
    if (row[0] < 0 || row[0] >= base.itemOrder.length || seen.has(row[0])) throw new Error('Invalid scale item index')
    seen.add(row[0])
    const itemCode = base.itemOrder[row[0]]
    const raw = rawAnswerMap.get(itemCode)
    if (context.full && !raw) throw new Error('Original raw answer unavailable for full scale hydration')
    const rawExtras: Record<string, unknown> = {}
    if (context.full && raw?.timing) {
      for (let i = 0; i < itemRawKeys.length; i++) {
        const k = itemRawKeys[i]
        if ((row[3] & (1 << i)) && Object.prototype.hasOwnProperty.call(raw.timing, k)) {
          rawExtras[k] = raw.timing[k]
        }
      }
    }
    return {
      itemCode,
      ...(context.full ? { responseValue: raw!.responseValue } : {}),
      baseScore: row[1],
      score: row[2],
      ...rawExtras,
      ...plain(row[4]),
    } as any
  })

  if (context.full) {
    const validated = parseScaleResultV2(result)
    if (canonicalHash(validated) !== fact.sourceResultHash) {
      throw new Error('Composite scale full hydration integrity mismatch')
    }
    Object.assign(result, validated)
  } else {
    Object.defineProperty(result, SCALE_REPORT_FACTS_VIEW, { value: true })
  }

  let canonical: CanonicalUnitResultEnvelopeV1 | null = null
  if (canonicalGraph && context.canonical !== false) {
    const metadata = [
      null,
      null,
      context.completedAt,
      {
        sourceType: 'ASSESSMENT',
        sourceAttemptId: context.attemptId,
        sourceSubmissionId: context.submissionId ?? context.attemptId,
      },
      fact.sourceResultHash,
    ]
    const decoded = decodeCanonicalGraph(canonicalGraph, result, fact.canonicalValues ?? [], metadata)
    decoded.resultHash = canonicalHash(decoded.core)
    if (decoded.bundleBridge) decoded.bundleBridgeHash = canonicalHash(decoded.bundleBridge)
    canonical = parseCanonicalUnitResultEnvelope(decoded)
    if (fact.canonicalResultHash && canonical.resultHash !== fact.canonicalResultHash) {
      throw new Error('Composite scale canonical digest mismatch')
    }
  }

  return { result, canonical }
}

export function encodeCompositeFinalFacts(facts: CompositeFinalFactsV1): { cipher: string; hash: string } {
  const validated = compositeFinalFactsSchema.parse(facts) as CompositeFinalFactsV1
  const hash = canonicalHash(validated)
  const cipher = encryptCompactField(validated, MAX_FINAL_FACTS_BYTES)
  return { cipher, hash }
}

export function decodeCompositeFinalFacts(cipher: string, expectedHash?: string): CompositeFinalFactsV1 {
  const decoded = decryptCompactField<unknown>(cipher, MAX_FINAL_FACTS_BYTES)
  const parsed = compositeFinalFactsSchema.parse(decoded) as CompositeFinalFactsV1
  if (expectedHash !== undefined && canonicalHash(parsed) !== expectedHash) {
    throw new Error('Composite final facts digest mismatch')
  }
  return parsed
}

export function encodeCompositeFinalRaw(raw: CompositeFinalRawV1): { cipher: string; hash: string } {
  const validated = compositeFinalRawSchema.parse(raw)
  const hash = canonicalHash(validated)
  const cipher = encryptCompactField(validated, MAX_FINAL_RAW_BYTES)
  return { cipher, hash }
}

export function decodeCompositeFinalRaw(cipher: string, expectedHash?: string): CompositeFinalRawV1 {
  const decoded = decryptCompactField<unknown>(cipher, MAX_FINAL_RAW_BYTES)
  const parsed = compositeFinalRawSchema.parse(decoded)
  if (expectedHash !== undefined && canonicalHash(parsed) !== expectedHash) {
    throw new Error('Composite final raw digest mismatch')
  }
  return parsed
}

export function encodeCompositeUnitSeeds(seeds: CompositeUnitSeedsV1): string {
  const validated = compositeUnitSeedsSchema.parse(seeds)
  return encryptCompactField(validated, 64 * 1024)
}

export function decodeCompositeUnitSeeds(cipher: string): CompositeUnitSeedsV1 {
  const decoded = decryptCompactField<unknown>(cipher, 64 * 1024)
  return compositeUnitSeedsSchema.parse(decoded)
}
