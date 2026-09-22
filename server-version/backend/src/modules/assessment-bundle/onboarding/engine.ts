import type { BundleEngineInputV1, BundleEngineResultV1 } from '../registry'
import type { EvidenceItemV1 } from '../types'
import { parseDeclarativePackage, type Condition } from './contract'
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
    const quality = invalid || source.qualityState==='invalid' ? 'invalid' as const : missing || score?.status==='not_calculable' ? 'unavailable' as const : source.qualityState==='limited' || score?.status==='limited' ? 'limited' as const : 'interpretable' as const
    const kind = slot.unitType==='SCALE' ? 'SCALE_SCORE' as const : slot.unitType==='COGNITIVE' ? 'COGNITIVE_METRIC' as const : 'SITUATIONAL_METRIC' as const
    return { evidenceKey:mapping.evidenceKey, constructKey:mapping.construct, role:mapping.role,
      source:kind==='SCALE_SCORE'?{kind,slotKey:slot.slotKey,scoreKey:mapping.selector,sourceResultHash:source.sourceResultHash}:{kind,slotKey:slot.slotKey,metricKey:mapping.selector,sourceResultHash:source.sourceResultHash},
      value:invalid?{state:'invalid' as const}:missing?{state:'missing' as const}:{state:'present' as const,value:raw as number|string|boolean,unit:mapping.unit},quality,criterionBandKey:score?.criterionBandKey??null }
  })
}
export function runDeclarativeEvidence(input: BundleEngineInputV1): BundleEngineResultV1 {
  const pack = parseDeclarativePackage(input.declarativePackage)
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
