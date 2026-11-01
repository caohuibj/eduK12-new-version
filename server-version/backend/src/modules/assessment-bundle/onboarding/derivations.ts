import {z} from 'zod'
import type {EvidenceItemV1,FactPresenceV1} from '../types'
import type {ProfileState} from '../profile/match'
import {derivationInputs,type DerivedPackage} from './contract'

export type DerivedState=FactPresenceV1['state']
export interface DerivedScalar {key:string;op:'RANGE_POSITION'|'SCALE'|'RATIO';inputKeys:string[];state:DerivedState;value:number|null}
export interface ExactMaximumSet {key:string;inputKeys:string[];state:DerivedState;maximum:number|null;maxKeys:string[]|null;orderedKeys:string[]|null}
export interface DerivedTheme {state:ProfileState;profileId:string|null;axisKeys:string[];margin:null}
export interface FrozenDerivedValues {scalars:DerivedScalar[];maxSets:ExactMaximumSet[];theme:DerivedTheme|null}
const state=z.enum(['present','missing','invalid','not_applicable']),key=z.string().min(1)
export const frozenDerivedValuesSchema=z.object({
  scalars:z.array(z.object({key,op:z.enum(['RANGE_POSITION','SCALE','RATIO']),inputKeys:z.array(key),state,value:z.number().finite().nullable()}).strict()).max(32),
  maxSets:z.array(z.object({key,inputKeys:z.array(key),state,maximum:z.number().finite().nullable(),maxKeys:z.array(key).nullable(),orderedKeys:z.array(key).nullable()}).strict()).max(32),
  theme:z.object({state:z.enum(['MATCHED','MIXED','BOUNDARY','UNCLASSIFIED','INSUFFICIENT','INVALID','NOT_APPLICABLE']),profileId:key.nullable(),axisKeys:z.array(key),margin:z.null()}).strict().nullable(),
}).strict()

/** State comes from the selected frozen metric, never from a non-null value alone. */
export function numericEvidenceState(e:EvidenceItemV1|undefined):{state:DerivedState;value:number|null}{
  if(!e)return {state:'missing',value:null}
  if(e.value.state==='invalid'||e.quality==='invalid')return {state:'invalid',value:null}
  if(e.value.state==='not_applicable')return {state:'not_applicable',value:null}
  if(e.value.state!=='present'||e.quality!=='interpretable')return {state:'missing',value:null}
  return typeof e.value.value==='number'&&Number.isFinite(e.value.value)?{state:'present',value:e.value.value}:{state:'invalid',value:null}
}
/** Declared exact-source ranges also guard rule evaluation. Keep original facts
 * untouched; this is an effective view for the new bounded calculation only. */
export function effectiveDerivedEvidence(pack:DerivedPackage,evidence:readonly EvidenceItemV1[]):EvidenceItemV1[]{
  const ranges=new Map<string,Array<{min:number;max:number}>>()
  const add=(key:string,range:{min:number;max:number})=>ranges.set(key,[...(ranges.get(key)??[]),range])
  for(const d of pack.rules.derivations)if(d.op==='RANGE_POSITION')add(d.input,d)
  for(const row of pack.report.rows)if(row.valueRef.kind==='evidence'&&row.range)add(row.valueRef.key,row.range)
  return evidence.map(e=>{
    const raw=e.value.state==='present'?e.value.value:null
    return typeof raw==='number'&&Number.isFinite(raw)&&ranges.get(e.evidenceKey)?.some(r=>raw<r.min||raw>r.max)?{...e,value:{state:'invalid'},quality:'invalid'}:e
  })
}
function inputState(inputs:ReturnType<typeof numericEvidenceState>[]):DerivedState {
  return inputs.some(x=>x.state==='invalid')?'invalid':inputs.some(x=>x.state==='not_applicable')?'not_applicable':inputs.some(x=>x.state!=='present')?'missing':'present'
}
/** Four fixed operations over declared frozen source metrics. No scripts, clocks,
 * source re-scoring, display rounding, clipping, or recursive expressions. */
export function computeDerivedValues(pack:DerivedPackage,evidence:readonly EvidenceItemV1[],firedRuleIds:readonly string[]):FrozenDerivedValues {
  const byKey=new Map(evidence.map(e=>[e.evidenceKey,e])),scalars:DerivedScalar[]=[],maxSets:ExactMaximumSet[]=[]
  for(const d of pack.rules.derivations){
    const inputKeys=derivationInputs(d),values=inputKeys.map(k=>numericEvidenceState(byKey.get(k))),state=inputState(values)
    if(d.op==='EXACT_MAX_SET'){
      const out:ExactMaximumSet={key:d.key,inputKeys:[...inputKeys],state,maximum:null,maxKeys:null,orderedKeys:null}
      if(state==='present'){
        const entries=values.map((x,n)=>({key:inputKeys[n],value:x.value!,position:n}))
        out.maximum=Math.max(...entries.map(x=>x.value));out.maxKeys=entries.filter(x=>x.value===out.maximum).map(x=>x.key)
        out.orderedKeys=[...entries].sort((a,b)=>b.value-a.value||a.position-b.position).map(x=>x.key)
      }
      maxSets.push(out);continue
    }
    const out:DerivedScalar={key:d.key,op:d.op,inputKeys:[...inputKeys],state,value:null}
    if(state==='present'){
      if(d.op==='RANGE_POSITION'){
        const raw=values[0].value!
        if(raw<d.min||raw>d.max)out.state='invalid'
        else {const position=(raw-d.min)/(d.max-d.min);out.value=d.orientation==='REFLECT'?1-position:position}
      }else if(d.op==='SCALE'){
        if(values[0].value!<0)out.state='invalid'
        else out.value=values[0].value!*d.factor
      }
      else {
        const denominator=values[1].value!*(d.denominatorMultiplier??1)
        if(denominator===0)out.state='missing'
        else if(denominator<0||values[0].value!<0||values[0].value!>denominator)out.state='invalid'
        else out.value=values[0].value!/denominator
      }
      if(out.value!==null&&!Number.isFinite(out.value)){out.value=null;out.state='invalid'}
    }
    scalars.push(out)
  }
  let theme:DerivedTheme|null=null
  if(pack.rules.theme){
    const {axisKeys,ruleIds}=pack.rules.theme,axisState=inputState(axisKeys.map(k=>scalars.find(s=>s.key===k)!)),matched=ruleIds.filter(id=>firedRuleIds.includes(id))
    theme={axisKeys:[...axisKeys],state:axisState==='invalid'?'INVALID':axisState==='not_applicable'?'NOT_APPLICABLE':axisState==='missing'?'INSUFFICIENT':matched.length===1?'MATCHED':matched.length>1?'MIXED':'BOUNDARY',profileId:axisState==='present'&&matched.length===1?matched[0]:null,margin:null}
  }
  return {scalars,maxSets,theme}
}

/** Validate saved shape and its declared identities; never recompute on read. */
export function readFrozenDerivedValues(pack:DerivedPackage,raw:unknown):FrozenDerivedValues {
  const value=frozenDerivedValuesSchema.parse(raw)
  const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((x,n)=>x===b[n])
  const expectedScalars=pack.rules.derivations.filter(d=>d.op!=='EXACT_MAX_SET'),expectedSets=pack.rules.derivations.filter(d=>d.op==='EXACT_MAX_SET')
  if(value.scalars.length!==expectedScalars.length||value.maxSets.length!==expectedSets.length)throw new Error('DERIVED_SAVED_IDENTITY')
  for(const [n,d] of expectedScalars.entries()){
    const s=value.scalars[n];if(s.key!==d.key||s.op!==d.op||!same(s.inputKeys,derivationInputs(d))||(s.state==='present')!==(s.value!==null))throw new Error('DERIVED_SAVED_IDENTITY')
  }
  for(const [n,d] of expectedSets.entries()){
    const s=value.maxSets[n],keys=derivationInputs(d)
    if(s.key!==d.key||!same(s.inputKeys,keys)||(s.state==='present')!==(s.maximum!==null&&s.maxKeys!==null&&s.orderedKeys!==null))throw new Error('DERIVED_SAVED_IDENTITY')
    if(s.state==='present'&&(!s.maxKeys!.length||new Set(s.maxKeys!).size!==s.maxKeys!.length||new Set(s.orderedKeys!).size!==keys.length||s.orderedKeys!.length!==keys.length||[...s.maxKeys!,...s.orderedKeys!].some(k=>!keys.includes(k))||!same(s.maxKeys!,s.orderedKeys!.slice(0,s.maxKeys!.length))))throw new Error('DERIVED_SAVED_IDENTITY')
    if(s.state!=='present'&&(s.maximum!==null||s.maxKeys!==null||s.orderedKeys!==null))throw new Error('DERIVED_SAVED_IDENTITY')
  }
  if(Boolean(pack.rules.theme)!==Boolean(value.theme)||value.theme&&(!same(value.theme.axisKeys,pack.rules.theme!.axisKeys)||(value.theme.state==='MATCHED')!==(value.theme.profileId!==null)||value.theme.profileId!==null&&!pack.rules.theme!.ruleIds.includes(value.theme.profileId)))throw new Error('DERIVED_SAVED_IDENTITY')
  return value
}
