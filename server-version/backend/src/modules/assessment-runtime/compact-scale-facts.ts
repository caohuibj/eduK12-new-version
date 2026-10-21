import { sharedControlWritesEnabled } from './shared-control-records'
import { canonicalHash } from './canonical'
import { encryptCompactField, decryptCompactField, isCompactEncryptedField } from './compact-field-codec'
import { publicTemplates, type PublicTemplateStore, type PublicTemplateKind } from './public-templates'
import { parseScaleResultV2, type ScaleResultV2 } from '../scale/scale-result'
import type { ScaleAnswer } from '../scale/scale-scoring'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from './unit-result'

export const SCALE_REPORT_FACTS_VIEW = Symbol('verified compact scale report view')
export const isScaleReportFactsView = (value: any): boolean => value?.[SCALE_REPORT_FACTS_VIEW] === true
export type ScaleFactsBinding = { assessmentId: string; attemptEpoch: number; submissionId: string; payloadHash: string }
type Graph = any[]
type Facts = {
  kind: 'SCALE_RESULT_FACTS'; version: 1|2; binding: ScaleFactsBinding; sourceResultHash: string;
  base: string; scores: Array<[number | null, string, boolean, number[] | null, Record<string, unknown>]>;
  quality: ScaleResultV2['quality']; context: ScaleResultV2['method']['assessmentContext'];
  items: Array<[number, number, number, number, Record<string, unknown>]>;
  references: Array<{ base: string; band: string | null; hasBand: boolean; dynamic: Record<string, unknown> }>;
  interpretations: Array<{ template: string; extras: Record<string, unknown> }>; caveats: string;
  extras: Record<string, unknown>; methodExtras: Record<string, unknown>;
  canonical: null | { template: string; values: unknown[] }; completedAt?: string;
}
const pick = (value: any, keys: readonly string[]) => Object.fromEntries(keys.filter(k => Object.prototype.hasOwnProperty.call(value, k)).map(k => [k, value[k]]))
const omit = (value: any, keys: readonly string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const scoreStatic = ['key','type','label','description','direction','canonical','displayPrecision','range','expectedItems']
const methodStatic = ['scaleId','instrumentVersion','scoringVersion','reportVersion','reportAudience','localizationVersion','definitionHash','referenceVersions']
const referenceStatic = ['scoreKey','referenceVersion','referenceKind','evidenceLevel','label','mean','sd','bandProvenance','source','population','instrumentVersion','scoringVersion','limitations','disclaimer']
const interpretationStatic = ['scoreKey','headline','label','interpretation','guidance','limitations','referenceVersion']
const verifiedBases = new WeakSet<object>()
const resultKeys = ['schemaVersion','instrument','method','quality','itemScores','scores','references','interpretations','caveats','disclaimer']
const itemRawKeys = ['responseTimeMs','answeredAt','changeCount'] as const
const itemKeys = ['itemCode','responseValue','baseScore','score',...itemRawKeys]
const same = (a: unknown, b: unknown) => a===b || (!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&canonicalHash(a)===canonicalHash(b))
const at = (value: any, path: Array<string | number>): any => path.reduce((current, key) => current == null ? null : current[key] ?? null, value)

/** Canonical and Bundle values refer to the score/reference facts, not second score copies. */
const encodeCanonicalGraph = (envelope: CanonicalUnitResultEnvelopeV1, result: ScaleResultV2, compactMetadata = false): { graph: Graph; values: unknown[] } => {
  const values: unknown[] = []
  const personal = (value: unknown): Graph => { const index = values.length; values.push(value); return [4,index] }
  const link = (value: unknown, path: Array<string | number>): Graph => same(value, at(result,path)) ? [3,path] : personal(value)
  const visit = (value: any, path: Array<string | number>): Graph => {
    const where = path.join('.')
    if(compactMetadata){const meta=['resultHash','bundleBridgeHash','completedAt','persistenceProvenance','bundleBridge.sourceResultHash'].indexOf(where);if(meta>=0)return [5,meta]}
    if (where === 'bundleBridge.rawScoreFeedback') return link(value,['rawScoreFeedback'])
    if (where === 'core.quality') return link(value,['quality'])
    if (where === 'core.contextHash') return link(value,['method','assessmentContext','snapshotHash'])
    if (/^core\.metrics\.[0-9]+\.(value|quality)$/.test(where)) {
      const metric = envelope.core.metrics[path[2] as number], index = result.scores.findIndex(s => s.key === metric.key)
      if (index < 0) throw new Error('Canonical metric is not in compact result')
      return link(value,['scores',index,path[3] === 'value' ? 'value' : 'status'])
    }
    if (/^core\.references\.[0-9]+\.(value|z|percentile|classification|status)$/.test(where)) {
      const ref = envelope.core.references[path[2] as number]
      const index = result.references.findIndex(r => r.referenceVersion === ref.referenceVersion && (!ref.scoreKey || r.scoreKey === ref.scoreKey))
      if (index >= 0) {
        const field = path[3]
        return link(value,['references',index,...(field === 'percentile' ? ['percentile','value'] : field === 'classification' ? ['criterionBand','key'] : [field])])
      }
      return personal(value)
    }
    if (/^bundleBridge\.scores\.[0-9]+\.(value|status|criterionBandKey)$/.test(where)) {
      const score = envelope.bundleBridge!.scores![path[2] as number], index = result.scores.findIndex(s => s.key === score.scoreKey)
      if (index < 0) throw new Error('Bundle metric is not in compact result')
      if (path[3] !== 'criterionBandKey') return link(value,['scores',index,path[3]])
      const refIndex = result.references.findIndex(r => r.scoreKey === score.scoreKey && r.status === 'available' && r.referenceKind === 'criterion_threshold')
      return refIndex < 0 ? personal(value) : link(value,['references',refIndex,'criterionBand','key'])
    }
    if (['resultHash','bundleBridgeHash','completedAt','persistenceProvenance','bundleBridge.sourceResultHash','core.facts'].includes(where)) return personal(value)
    if (value === null || typeof value !== 'object') return [0,value]
    if (Array.isArray(value)) return [1,value.map((v,i) => visit(v,[...path,i]))]
    return [2,Object.entries(value).map(([k,v]) => [k,visit(v,[...path,k])])]
  }
  return { graph: visit(envelope,[]), values }
}
const decodeGraph = (node: Graph, result: ScaleResultV2, values: unknown[], depth = 0, metadata?: unknown[]): any => {
  if (!Array.isArray(node) || node.length !== 2 || depth > 64) throw new Error('Invalid canonical view graph')
  switch (node[0]) {
    case 0: if (node[1] !== null && !['string','number','boolean'].includes(typeof node[1])) throw new Error('Invalid graph constant'); return node[1]
    case 1: if (!Array.isArray(node[1])) throw new Error('Invalid graph array'); return node[1].map((v: Graph) => decodeGraph(v,result,values,depth+1,metadata))
    case 2: if (!Array.isArray(node[1])) throw new Error('Invalid graph record'); return Object.fromEntries(node[1].map(([k,v]: [string,Graph]) => { if (typeof k !== 'string') throw new Error('Invalid graph key'); return [k,decodeGraph(v,result,values,depth+1,metadata)] }))
    case 3: if (!Array.isArray(node[1]) || node[1].some((x: unknown) => typeof x !== 'string' && !Number.isSafeInteger(x))) throw new Error('Invalid graph path'); return plain(at(result,node[1]))
    case 4: if (!Number.isSafeInteger(node[1]) || node[1] < 0 || node[1] >= values.length) throw new Error('Invalid graph personal index'); return plain(values[node[1]])
    case 5: if(!metadata||!Number.isInteger(node[1])||node[1]<0||node[1]>=metadata.length)throw new Error('Invalid graph metadata reference');return plain(metadata[node[1]])
    default: throw new Error('Invalid graph opcode')
  }
}
export const isCompactScaleFacts = (value: any): value is Facts => value?.kind === 'SCALE_RESULT_FACTS'
export const decodeScaleFacts = (value: unknown): Facts | null => {
  if (typeof value !== 'string' || !isCompactEncryptedField(value)) return null
  const data = decryptCompactField<any>(value)
  if (!isCompactScaleFacts(data)) return null
  if (![1,2].includes(data.version) || (data.version===2&&data.canonical&&typeof data.completedAt!=='string') || !data.binding || typeof data.binding.assessmentId !== 'string' || !Number.isSafeInteger(data.binding.attemptEpoch)
    || data.binding.attemptEpoch < 1 || typeof data.binding.submissionId !== 'string' || !/^[a-f0-9]{64}$/.test(data.binding.payloadHash)
    || !/^[a-f0-9]{64}$/.test(data.sourceResultHash) || !Array.isArray(data.scores) || !Array.isArray(data.items)
    || !Array.isArray(data.references) || !Array.isArray(data.interpretations) || data.scores.length > 20000 || data.items.length > 20000) throw new Error('Invalid compact scale facts')
  return data
}
export const assertScaleFactsBinding = (facts: Facts, record: any): void => {
  const expected = { assessmentId: record.id, attemptEpoch: record.attemptEpoch, submissionId: record.submissionId, payloadHash: record.submissionPayloadHash }
  for (const key of Object.keys(expected) as Array<keyof ScaleFactsBinding>) if (expected[key] !== undefined && expected[key] !== facts.binding[key]) throw new Error('Compact result ownership/version binding mismatch')
}

export const prepareCompactScaleFacts = async (input: {
  result: ScaleResultV2; itemOrder: string[]; binding: ScaleFactsBinding; canonical?: CanonicalUnitResultEnvelopeV1 | null
}, templates: PublicTemplateStore = publicTemplates): Promise<string> => {
  const result = input.result
  const itemPositions = new Map(input.itemOrder.map((code,index)=>[code,index]))
  if (new Set(input.itemOrder).size !== input.itemOrder.length) throw new Error('Duplicate frozen question identity')
  const fragments: Array<{ kind: PublicTemplateKind; value: unknown }> = []
  const add = (kind: PublicTemplateKind, value: unknown) => { const index = fragments.length; fragments.push({kind,value}); return index }
  const baseIndex = add('SCALE_RESULT_BASE', { schemaVersion: 2, instrument: result.instrument,
    method: pick(result.method,methodStatic), scores: result.scores.map(s => pick(s,scoreStatic)), itemOrder: input.itemOrder, disclaimer: result.disclaimer })
  const refIndices = result.references.map(ref => ({ base: add('SCALE_REFERENCE',{ kind:'REFERENCE', value:pick(ref,referenceStatic) }),
    band: ref.criterionBand == null ? null : add('SCALE_REFERENCE',{kind:'BAND',value:ref.criterionBand}) }))
  const interpIndices = result.interpretations.map(x => add('SCALE_INTERPRETATION',pick(x,interpretationStatic)))
  const caveatIndex = add('SCALE_CAVEATS',result.caveats)
  const canonical = input.canonical ? encodeCanonicalGraph(parseCanonicalUnitResultEnvelope(input.canonical),result,sharedControlWritesEnabled()) : null
  const canonicalIndex = canonical ? add('SCALE_CANONICAL_LAYOUT',canonical.graph) : null
  const hashes = await templates.saveMany(fragments)
  const data: Facts = { kind:'SCALE_RESULT_FACTS', version:sharedControlWritesEnabled()?2:1, binding:input.binding, sourceResultHash:input.canonical?.bundleBridge?.sourceResultHash ?? canonicalHash(result), base:hashes[baseIndex],
    scores:result.scores.map(score => {
      const indices = score.answeredItems.map(code => { const index = score.expectedItems.indexOf(code); if(index < 0) throw new Error('Answered item is outside frozen score'); return index })
      const full = score.answeredItems.length === score.expectedItems.length && indices.every((v,i) => v===i)
      return [score.value,score.status,score.prorated,full?null:indices,omit(score,[...scoreStatic,'value','status','prorated','answeredItems'])]
    }), quality:result.quality, context:result.method.assessmentContext,
    items:result.itemScores.map(item => {
      const index = itemPositions.get(item.itemCode); if(index === undefined) throw new Error('Scored item is outside frozen form')
      let mask=0;itemRawKeys.forEach((key,i)=>{if(Object.prototype.hasOwnProperty.call(item,key))mask|=1<<i})
      return [index,item.baseScore,item.score,mask,omit(item,itemKeys)]
    }), references:result.references.map((ref,i)=>({base:hashes[refIndices[i].base],band:refIndices[i].band===null?null:hashes[refIndices[i].band!],hasBand:Object.prototype.hasOwnProperty.call(ref,'criterionBand'),dynamic:omit(ref,[...referenceStatic,'criterionBand'])})),
    interpretations:result.interpretations.map((v,i)=>({template:hashes[interpIndices[i]],extras:omit(v,interpretationStatic)})),caveats:hashes[caveatIndex],
    extras:omit(result,resultKeys), methodExtras:omit(result.method,[...methodStatic,'assessmentContext']),
    canonical:canonical?{template:hashes[canonicalIndex!],values:canonical.values}:null, ...(sharedControlWritesEnabled()&&input.canonical?{completedAt:input.canonical.completedAt}:{}) }
  // Exhaustive roundtrip is a focused validation mode, not repeated grading on the hot path.
  if (process.env.ASSESSMENT_COMPACT_VERIFY_WRITES === 'true') {
    const reconstructed = await restoreCompactScaleFacts(data,{answers:result.itemScores.map(i=>pick(i,['itemCode','responseValue',...itemRawKeys]) as unknown as ScaleAnswer),full:true},templates)
    if (!same(result,reconstructed.result) || (input.canonical && !same(input.canonical,reconstructed.canonical))) throw new Error('Compact result roundtrip mismatch')
  }
  return encryptCompactField(data)
}

export const restoreCompactScaleFacts = async (facts: Facts, options: { full?: boolean; answers?: ScaleAnswer[]; canonical?: boolean; reportOnly?: boolean } = {}, templates: PublicTemplateStore = publicTemplates): Promise<{ result: ScaleResultV2; canonical: CanonicalUnitResultEnvelopeV1 | null }> => {
  const requests: Array<{hash:string;kind:PublicTemplateKind}>=[{hash:facts.base,kind:'SCALE_RESULT_BASE'},{hash:facts.caveats,kind:'SCALE_CAVEATS'}]
  for(const ref of facts.references){requests.push({hash:ref.base,kind:'SCALE_REFERENCE'});if(ref.band)requests.push({hash:ref.band,kind:'SCALE_REFERENCE'})}
  for(const ref of facts.interpretations)requests.push({hash:ref.template,kind:'SCALE_INTERPRETATION'})
  if(facts.canonical&&options.canonical!==false)requests.push({hash:facts.canonical.template,kind:'SCALE_CANONICAL_LAYOUT'})
  const loaded=await templates.loadMany(requests);let cursor=0
  const base=loaded[cursor++],caveats=loaded[cursor++]
  if(!base||base.schemaVersion!==2||!Array.isArray(base.scores)||base.scores.length!==facts.scores.length||!Array.isArray(base.itemOrder))throw new Error('Invalid compact score template')
  if(!verifiedBases.has(base)){
    parseScaleResultV2({schemaVersion:2,instrument:base.instrument,method:{...base.method,assessmentContext:null},quality:{status:'interpretable',flags:[]},
      itemScores:[],scores:base.scores.map((meta:any)=>({...meta,value:0,status:'calculated',prorated:false,answeredItems:meta.expectedItems})),references:[],interpretations:[],caveats:[],disclaimer:base.disclaimer})
    verifiedBases.add(base)
  }
  const references=facts.references.map(ref=>{const template=loaded[cursor++];if(template.kind!=='REFERENCE')throw new Error('Invalid reference template');let band=null;if(ref.band){const b=loaded[cursor++];if(b.kind!=='BAND')throw new Error('Invalid band template');band=b.value}return {...template.value,...ref.dynamic,...(ref.hasBand?{criterionBand:band}:{})}})
  const interpretations=facts.interpretations.map(ref=>({...loaded[cursor++],...ref.extras}))
  const scores=facts.scores.map((row,i)=>{
    if(!Array.isArray(row)||row.length!==5||!(row[0]===null||Number.isFinite(row[0]))||!['calculated','limited','not_calculable'].includes(row[1])||typeof row[2]!=='boolean')throw new Error('Invalid compact score fact')
    const meta=base.scores[i],expected=meta.expectedItems
    const answered=row[3]===null?[...expected]:row[3].map(index=>{if(!Number.isSafeInteger(index)||index<0||index>=expected.length)throw new Error('Invalid answered item reference');return expected[index]})
    return {...meta,value:row[0],status:row[1],prorated:row[2],answeredItems:answered,...row[4]}
  })
  if(!facts.quality||!['interpretable','limited','invalid'].includes(facts.quality.status)||!Array.isArray(facts.quality.flags)||facts.quality.flags.some(flag=>!['missing_items','insufficient_items','score_not_calculable'].includes(flag)))throw new Error('Invalid compact result quality')
  const canonicalScores=scores.filter(score=>score.canonical),quality=canonicalScores.some(s=>s.status==='not_calculable')?'invalid':canonicalScores.some(s=>s.status==='limited')?'limited':'interpretable'
  if(quality!==facts.quality.status||(quality==='invalid'&&!facts.quality.flags.includes('score_not_calculable'))||(quality==='limited'&&!facts.quality.flags.some(f=>f==='missing_items'||f==='insufficient_items')))throw new Error('Compact result quality mismatch')
  if(scores.some(score=>(score.status==='not_calculable')!==(score.value===null)))throw new Error('Compact score status mismatch')
  if(facts.context!==null&&(!facts.context||facts.context.schemaVersion!==1||typeof facts.context.snapshotHash!=='string'||!facts.context.snapshotHash))throw new Error('Invalid result context binding')
  const result={...facts.extras,schemaVersion:2,instrument:base.instrument,method:{...base.method,...facts.methodExtras,assessmentContext:facts.context},quality:facts.quality,itemScores:[],scores,references,interpretations,caveats,disclaimer:base.disclaimer} as ScaleResultV2
  const answers=new Map((options.answers??[]).map(a=>[a.itemCode,a]))
  const seen=new Set<number>()
  if(options.reportOnly&&(options.full||options.canonical!==false))throw new Error('Report view requires a narrow result request')
  result.itemScores=options.reportOnly?[]:facts.items.map(row=>{
    if(!Array.isArray(row)||row.length!==5||!Number.isSafeInteger(row[0])||row[0]<0||row[0]>=base.itemOrder.length||seen.has(row[0])||!Number.isFinite(row[1])||!Number.isFinite(row[2])||!Number.isInteger(row[3])||row[3]<0||row[3]>7)throw new Error('Invalid compact item facts')
    seen.add(row[0]);const itemCode=base.itemOrder[row[0]],raw=answers.get(itemCode)
    if(options.full&&!raw)throw new Error('Original raw answer unavailable')
    return {itemCode,...(options.full?{responseValue:raw!.responseValue}:{}),baseScore:row[1],score:row[2],...Object.fromEntries(itemRawKeys.flatMap((key,i)=>options.full&&(row[3]&1<<i)?[[key,raw![key]]]:[])),...plain(row[4])} as any
  })
  if(options.full){const validated=parseScaleResultV2(result);if(canonicalHash(validated)!==facts.sourceResultHash)throw new Error('Original result integrity mismatch');Object.assign(result,validated)}
  else Object.defineProperty(result,SCALE_REPORT_FACTS_VIEW,{value:true})
  let canonical:CanonicalUnitResultEnvelopeV1|null=null
  if(facts.canonical&&options.canonical!==false){
    const metadata=facts.completedAt?[null,null,facts.completedAt,{sourceType:'ASSESSMENT',sourceAttemptId:facts.binding.assessmentId,sourceSubmissionId:facts.binding.submissionId},facts.sourceResultHash]:undefined
    const decoded=decodeGraph(loaded[cursor++],result,facts.canonical.values,0,metadata)
    if(metadata){decoded.resultHash=canonicalHash(decoded.core);if(decoded.bundleBridge)decoded.bundleBridgeHash=canonicalHash(decoded.bundleBridge)}
    canonical=parseCanonicalUnitResultEnvelope(decoded)
  }
  return {result,canonical}
}

export const prefetchCompactScaleTemplates = async (facts: Facts[], templates: PublicTemplateStore = publicTemplates, options: {canonical?: boolean} = {}): Promise<void> => {
  const requests: Array<{hash:string;kind:PublicTemplateKind}> = []
  for(const f of facts){requests.push({hash:f.base,kind:'SCALE_RESULT_BASE'},{hash:f.caveats,kind:'SCALE_CAVEATS'})
    for(const r of f.references){requests.push({hash:r.base,kind:'SCALE_REFERENCE'});if(r.band)requests.push({hash:r.band,kind:'SCALE_REFERENCE'})}
    for(const r of f.interpretations)requests.push({hash:r.template,kind:'SCALE_INTERPRETATION'})
    if(f.canonical&&options.canonical!==false)requests.push({hash:f.canonical.template,kind:'SCALE_CANONICAL_LAYOUT'})}
  if(requests.length)await templates.loadMany(requests)
}
