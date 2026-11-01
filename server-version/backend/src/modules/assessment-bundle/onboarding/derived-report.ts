import {z} from 'zod'
import type {DisclosureCapabilitiesV1} from '../../scale/policy/types'
import type {BundleReportAudienceV1,EvidenceItemV1} from '../types'
import type {DeclarativePackage,DerivedPackage} from './contract'
import {derivationInputs} from './contract'
import {numericEvidenceState,readFrozenDerivedValues,type DerivedState,type DerivedTheme,type ExactMaximumSet} from './derivations'

export interface DerivedConclusion {ruleId:string;ruleVersion:string;kind:string;text:string;evidenceKeys:string[];supportRefs:string[]}
export interface DerivedReportRow {
  rowKey:string;label:string;value:number|null;state:DerivedState|'redacted';unit:DerivedPackage['report']['rows'][number]['unit']
  range:{min:number;max:number}|null;denominator:number|null;itemCount:number|null;timeframe:string|null;order:number;evidenceKeys:string[]
}
export interface DerivedBundleView {
  schemaVersion:'bundle-derived-view-v1'
  rows:DerivedReportRow[]
  maxSets:Array<Omit<ExactMaximumSet,'state'|'inputKeys'>&{state:DerivedState|'redacted'}>
  theme:(Omit<DerivedTheme,'state'>&{state:DerivedTheme['state']|'WITHHELD'})|null
  conclusions:DerivedConclusion[]
  blocks:Array<{blockId:string;kind:'evidence'|'conclusions'|'limitations';title:string;rowKeys:string[];maxSetKeys:string[];ruleIds:string[]}>
}
const savedPayload=z.object({
  schemaVersion:z.literal('declarative-derived-report-v1'),status:z.literal('declarative'),
  identity:z.object({bundleKey:z.string(),bundleVersion:z.string(),engineVersion:z.literal('1.2.0'),mappingVersion:z.string(),templateVersion:z.string()}).strict(),
  conclusions:z.array(z.object({ruleId:z.string(),ruleVersion:z.string(),kind:z.string(),text:z.string(),evidenceKeys:z.array(z.string()),supportRefs:z.array(z.string())}).strict()).max(64),
  derived:z.unknown(),
}).strict()

/** Authorized readers pass validated saved facts, their effective per-slot
 * policies and the existing unit/metric release intersection. This helper does
 * no I/O, role inference, new granting, raw-answer read or recalculation. */
export function projectDerivedBundleView(input:{
  pack:DeclarativePackage;payload:unknown;evidence:readonly EvidenceItemV1[]
  policies:ReadonlyMap<string,DisclosureCapabilitiesV1|null>
  availableEvidenceKeys:ReadonlySet<string>;audience:BundleReportAudienceV1
}):DerivedBundleView|null {
  if(input.pack.schemaVersion!==3)return null
  const pack=input.pack,payload=savedPayload.parse(input.payload),id=payload.identity
  if(id.bundleKey!==pack.manifest.definition.bundleKey||id.bundleVersion!==pack.manifest.definition.bundleVersion||id.mappingVersion!==pack.rules.version||id.templateVersion!==pack.report.version)throw new Error('DERIVED_SAVED_PACKAGE_IDENTITY')
  const values=readFrozenDerivedValues(pack,payload.derived),byKey=new Map(input.evidence.map(e=>[e.evidenceKey,e])),mapping=new Map(pack.evidence.map(e=>[e.evidenceKey,e]))
  const sameSet=(a:readonly string[],b:readonly string[])=>a.length===b.length&&[...a].sort().every((x,n)=>x===[...b].sort()[n])
  if(new Set(payload.conclusions.map(c=>c.ruleId)).size!==payload.conclusions.length)throw new Error('DERIVED_SAVED_CONCLUSION_IDENTITY')
  for(const c of payload.conclusions){
    const r=pack.rules.items.find(r=>r.ruleId===c.ruleId)
    if(!r||c.ruleVersion!==pack.rules.version||c.kind!==r.kind||c.text!==r.text||!sameSet(c.evidenceKeys,r.evidenceKeys)||!sameSet(c.supportRefs,r.supportRefs))throw new Error('DERIVED_SAVED_CONCLUSION_IDENTITY')
  }
  const numeric=(key:string)=>{const m=mapping.get(key);return !!m&&m.role!=='CONTEXT'&&input.availableEvidenceKeys.has(key)&&input.policies.get(m.slotKey)?.numericScores===true}
  const owned=pack.report.narrativeContent==='BUNDLE_OWNED_SELF'
  const narratable=(keys:readonly string[])=>keys.length>0&&(!owned||input.audience==='student')&&keys.every(key=>{
    const m=mapping.get(key)
    if(!m||!input.availableEvidenceKeys.has(key))return false
    if(m.role==='CONTEXT')return byKey.has(key)
    const p=input.policies.get(m.slotKey)
    return numeric(key)&&p?.individualInterpretations===true&&(owned||p.scoreDerivedLabels===true)
  })
  const derivations=new Map(pack.rules.derivations.map(d=>[d.key,d]))
  const refInputs=(ref:DerivedPackage['report']['rows'][number]['valueRef'])=>ref.kind==='evidence'?[ref.key]:derivationInputs(derivations.get(ref.key)!)
  const refValue=(ref:DerivedPackage['report']['rows'][number]['valueRef'])=>ref.kind==='evidence'?numericEvidenceState(byKey.get(ref.key)):values.scalars.find(s=>s.key===ref.key)!
  const blocks=pack.report.blocks.filter(b=>b.audience.includes(input.audience))
  const allowedRows=new Set(blocks.flatMap(b=>b.rowKeys??[])),allowedSets=new Set(blocks.flatMap(b=>b.maxSetKeys??[])),allowedRules=new Set(blocks.flatMap(b=>b.ruleIds))
  const rows=pack.report.rows.filter(r=>allowedRows.has(r.rowKey)).sort((a,b)=>a.order-b.order).map(r=>{
    const keys=[...new Set([...refInputs(r.valueRef),...(r.denominatorRef?refInputs(r.denominatorRef):[])])].sort(),visible=keys.every(numeric),v=refValue(r.valueRef),denominator=r.denominatorRef?refValue(r.denominatorRef):null
    return {rowKey:r.rowKey,label:r.label,unit:r.unit,order:r.order,range:r.range??null,itemCount:r.itemCount??null,timeframe:r.timeframe??null,evidenceKeys:keys,
      state:visible?v.state:'redacted',value:visible&&v.state==='present'?v.value:null,denominator:visible&&denominator?.state==='present'?denominator.value:null} as DerivedReportRow
  })
  const maxSets=values.maxSets.filter(s=>allowedSets.has(s.key)).map(s=>({key:s.key,
    state:narratable(s.inputKeys)?s.state:'redacted',maximum:narratable(s.inputKeys)?s.maximum:null,maxKeys:narratable(s.inputKeys)?s.maxKeys:null,orderedKeys:narratable(s.inputKeys)?s.orderedKeys:null,
  } as DerivedBundleView['maxSets'][number]))
  let theme:DerivedBundleView['theme']=null
  if(values.theme){
    const dependencies=[...new Set([...pack.rules.theme!.axisKeys.flatMap(k=>derivationInputs(derivations.get(k)!)),...pack.rules.theme!.ruleIds.flatMap(id=>pack.rules.items.find(r=>r.ruleId===id)!.evidenceKeys)])]
    theme=narratable(dependencies)?values.theme:{...values.theme,state:'WITHHELD',profileId:null}
  }
  const conclusions=payload.conclusions.filter(c=>allowedRules.has(c.ruleId)&&narratable(c.evidenceKeys)&&(c.kind==='limitation'||c.evidenceKeys.every(k=>byKey.get(k)?.quality==='interpretable'&&byKey.get(k)?.value.state==='present')))
  return {schemaVersion:'bundle-derived-view-v1',rows,maxSets,theme,conclusions,
    blocks:blocks.map(b=>({blockId:b.blockId,kind:b.kind,title:b.title,rowKeys:b.rowKeys??[],maxSetKeys:b.maxSetKeys??[],ruleIds:conclusions.filter(c=>b.ruleIds.includes(c.ruleId)).map(c=>c.ruleId)})),
  }
}
