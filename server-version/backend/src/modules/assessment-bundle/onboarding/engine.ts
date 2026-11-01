import type { BundleEngineInputV1, BundleEngineResultV1 } from '../registry'
import type { EvidenceItemV1 } from '../types'
import { runBundleProfile } from '../profile/match'
import { parseDeclarativePackage, type DeclarativePackage, type Condition } from './contract'
import {computeDerivedValues} from './derivations'
export type Truth = true | false | 'unknown'
export function evaluateCondition(c: Condition, evidence: EvidenceItemV1[]): Truth {
  if (c.op === 'all' || c.op === 'any') {
    const values = c.conditions.map(child => evaluateCondition(child, evidence))
    if (c.op === 'all') return values.includes(false) ? false : values.includes('unknown') ? 'unknown' : true
    return values.includes(true) ? true : values.includes('unknown') ? 'unknown' : false
  }
  if (c.op === 'not') { const v = evaluateCondition(c.condition, evidence); return v === 'unknown' ? v : !v }
  const leaf = c as Extract<Condition, { evidenceKey: string }>
  const item = evidence.find(e => e.evidenceKey === leaf.evidenceKey)
  if (!item) return 'unknown'
  if (!('value' in leaf)) {
    const state = item.quality === 'invalid' ? 'invalid'
      : item.quality === 'unavailable' && item.value.state === 'present' ? 'missing' : item.value.state
    return state === leaf.op
  }
  if (item.value.state !== 'present' || ['invalid','unavailable'].includes(item.quality)) return 'unknown'
  const value = item.value.value
  if (typeof value !== typeof leaf.value) return 'unknown'
  switch (leaf.op) {
    case 'eq': return value === leaf.value
    case 'ne': return value !== leaf.value
    case 'lt': return typeof value === 'number' && typeof leaf.value === 'number' ? value < leaf.value : 'unknown'
    case 'lte': return typeof value === 'number' && typeof leaf.value === 'number' ? value <= leaf.value : 'unknown'
    case 'gt': return typeof value === 'number' && typeof leaf.value === 'number' ? value > leaf.value : 'unknown'
    case 'gte': return typeof value === 'number' && typeof leaf.value === 'number' ? value >= leaf.value : 'unknown'
  }
}
/** Canonical projections only; no raw answers/trials, I/O, clock or package-specific branches. */
export function mapDeclarativeEvidence(input: BundleEngineInputV1): EvidenceItemV1[] {
  const pack = parseDeclarativePackage(input.declarativePackage)
  return [...pack.evidence].sort((a,b)=>a.evidenceKey.localeCompare(b.evidenceKey)).map(mapping => {
    const slot = pack.manifest.definition.slots.find(s=>s.slotKey===mapping.slotKey)!
    if (slot.unitType === 'FORM') {
      const fact = input.contextFacts?.facts.find(f=>f.contextKey===mapping.selector)
      return { evidenceKey:mapping.evidenceKey,constructKey:mapping.construct,role:mapping.role,
        source:{kind:'CONTEXT_FACT' as const,contextKey:mapping.selector,contextSnapshotHash:input.contextFacts?.contextSnapshotHash ?? '0'.repeat(64)},
        value:fact?.value ?? {state:'missing' as const},quality:fact?.value.state==='present'?'interpretable' as const:'unavailable' as const,criterionBandKey:null }
    }
    const source = slot.unitType==='SCALE' ? input.scaleSources?.find(s=>s.slotKey===slot.slotKey) : slot.unitType==='COGNITIVE' ? input.cognitiveSources?.find(s=>s.slotKey===slot.slotKey) : input.situationalSources?.find(s=>s.slotKey===slot.slotKey)
    if (!source || source.instrumentKey!==slot.instrumentKey || source.instrumentVersion!==slot.instrumentVersion) throw new Error('DECLARATIVE_SOURCE_IDENTITY_MISMATCH:'+slot.slotKey)
    const score = 'scores' in source ? source.scores.find(s=>s.scoreKey===mapping.selector) : undefined
    const raw = 'metrics' in source ? source.metrics[mapping.selector] : score?.value
    const missing = raw === undefined || raw === null
    const invalid = !missing && (typeof raw !== mapping.valueType || (typeof raw==='number' && !Number.isFinite(raw)))
    // Package2 binds a strict generic item-mean scorer and classifies the
    // selected core scores. Another score's missingness cannot invalidate it.
    const perScore=pack.schemaVersion===2 && slot.unitType==='SCALE'
    const quality = pack.schemaVersion===3?derivedSourceQuality(source,score,missing,invalid)
      : invalid || !perScore && source.qualityState==='invalid' ? 'invalid' as const : missing || score?.status==='not_calculable' ? 'unavailable' as const : !perScore && source.qualityState==='limited' || score?.status==='limited' ? 'limited' as const : 'interpretable' as const
    const kind = slot.unitType==='SCALE' ? 'SCALE_SCORE' as const : slot.unitType==='COGNITIVE' ? 'COGNITIVE_METRIC' as const : 'SITUATIONAL_METRIC' as const
    return { evidenceKey:mapping.evidenceKey, constructKey:mapping.construct, role:mapping.role,
      source:kind==='SCALE_SCORE'?{kind,slotKey:slot.slotKey,scoreKey:mapping.selector,sourceResultHash:source.sourceResultHash}:{kind,slotKey:slot.slotKey,metricKey:mapping.selector,sourceResultHash:source.sourceResultHash},
      value:invalid?{state:'invalid' as const}:missing?{state:'missing' as const}:{state:'present' as const,value:raw as number|string|boolean,unit:mapping.unit},quality,criterionBandKey:score?.criterionBandKey??null }
  })
}
/** New declarations may preserve an independently complete score when another
 * score is missing. Unknown/global quality failures remain failures. Canonical
 * adapters already carry these original flags; no new trust/hash scheme. */
function derivedSourceQuality(source:{qualityState:string},score:{status:string}|undefined,missing:boolean,invalid:boolean):EvidenceItemV1['quality'] {
  if(invalid)return 'invalid'
  const flags=(source as {profileIdentity?:{qualityFlags?:unknown}}).profileIdentity?.qualityFlags
  const missingOnly=Array.isArray(flags)&&flags.length>0&&flags.every(f=>['missing_items','score_not_calculable','insufficient_items'].includes(f))
  if(source.qualityState==='invalid'&&!missingOnly)return 'invalid'
  if(missing||score?.status==='not_calculable'||source.qualityState==='unavailable')return 'unavailable'
  if(score?.status==='limited'||source.qualityState==='limited'&&!missingOnly)return 'limited'
  if(score&&score.status!=='calculated')return 'invalid'
  return 'interpretable'
}
function runRules(input: BundleEngineInputV1,pack:DeclarativePackage): BundleEngineResultV1 {
  if (pack.manifest.definition.bundleKey!==input.snapshot.bundleKey || pack.manifest.definition.bundleVersion!==input.snapshot.bundleVersion) throw new Error('DECLARATIVE_PACKAGE_IDENTITY_MISMATCH')
  if (pack.rules.applicability && evaluateCondition(pack.rules.applicability,input.evidence)!==true) return {kind:'UNAVAILABLE',reason:'DECLARATIVE_NOT_APPLICABLE_OR_UNKNOWN'}
  const conclusions = [...pack.rules.items].sort((a,b)=>a.ruleId.localeCompare(b.ruleId)).filter(rule => {
    if (evaluateCondition(rule.when,input.evidence)!==true) return false
    return rule.kind==='limitation' || rule.evidenceKeys.every(key=>{
      const e=input.evidence.find(e=>e.evidenceKey===key), m=pack.evidence.find(e=>e.evidenceKey===key)!
      return e?.value.state==='present' && (e.quality==='interpretable' || (e.quality==='limited' && m.qualityPolicy==='allow_limited'))
    })
  }).map(rule=>({ruleId:rule.ruleId,ruleVersion:pack.rules.version,kind:rule.kind,text:rule.text,evidenceKeys:[...rule.evidenceKeys].sort(),supportRefs:[...rule.supportRefs].sort()}))
  return {kind:'COMPUTED',payload:{schemaVersion:'declarative-report-v1',status:'declarative',conclusions}}
}

export function runDeclarativeEvidence(input:BundleEngineInputV1):BundleEngineResultV1{
  const pack=parseDeclarativePackage(input.declarativePackage)
  if(pack.schemaVersion!==1)throw new Error('DECLARATIVE_ENGINE_PACKAGE_VERSION_MISMATCH')
  return runRules(input,pack)
}
export function runProfileEvidence(input:BundleEngineInputV1):BundleEngineResultV1{
  const pack=parseDeclarativePackage(input.declarativePackage)
  if(pack.schemaVersion!==2)throw new Error('DECLARATIVE_ENGINE_PACKAGE_VERSION_MISMATCH')
  const base=runRules(input,pack)
  // Package applicability governs the entire profile and its modifiers.
  if(base.kind==='UNAVAILABLE')return base
  const profile=runBundleProfile(pack.profile,input)
  const modifiers=pack.profile.modifierRuleIds.map(ruleId=>{
    const rule=pack.rules.items.find(r=>r.ruleId===ruleId)!
    const rows=rule.evidenceKeys.map(k=>input.evidence.find(e=>e.evidenceKey===k))
    const unknown=rows.some(e=>!e || e.quality!=='interpretable' || e.value.state!=='present')
    return {ruleId,state:profile.state!=='MATCHED'?'NOT_TRIGGERED':unknown?'UNKNOWN':evaluateCondition(rule.when,input.evidence)===true?'TRIGGERED':'NOT_TRIGGERED',
      evidenceKeys:[...rule.evidenceKeys].sort(),sourceResultHashes:[...new Set(rows.flatMap(e=>e && e.source.kind!=='CONTEXT_FACT'?[e.source.sourceResultHash]:[]))].sort()}
  })
  // Native Profile states remain available even when the core evidence abstains.
  return {kind:'COMPUTED',payload:{schemaVersion:'declarative-profile-report-v1',status:profile.state,
    conclusions:(base.payload as {conclusions:unknown[]}).conclusions,profile,modifiers}}
}

/** New exact version only. Existing V1/V2 dispatch and output stay untouched. */
export function runDerivedEvidence(input:BundleEngineInputV1):BundleEngineResultV1 {
  const pack=parseDeclarativePackage(input.declarativePackage)
  if(pack.schemaVersion!==3)throw new Error('DECLARATIVE_ENGINE_PACKAGE_VERSION_MISMATCH')
  const result=runRules(input,pack)
  if(result.kind==='UNAVAILABLE')return result
  const conclusions=(result.payload as {conclusions:Array<{ruleId:string}>}).conclusions
  return {kind:'COMPUTED',payload:{schemaVersion:'declarative-derived-report-v1',status:'declarative',
    identity:{bundleKey:pack.manifest.definition.bundleKey,bundleVersion:pack.manifest.definition.bundleVersion,engineVersion:'1.2.0',mappingVersion:pack.rules.version,templateVersion:pack.report.version},
    conclusions,derived:computeDerivedValues(pack,input.evidence,conclusions.map(c=>c.ruleId)),
  }}
}
