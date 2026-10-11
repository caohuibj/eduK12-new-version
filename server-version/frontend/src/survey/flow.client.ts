import { sanitizeFormAnswers } from './form-visibility'

export type FlowField=
  |{source:'ANSWER';instrumentKey:string;itemKey:string}
  |{source:'EMBEDDED';key:string}
export type FlowCondition=
  |{op:'AND'|'OR';terms:FlowCondition[]}
  |{op:'NOT';term:FlowCondition}
  |{op:'EQUALS'|'INCLUDES'|'GT'|'GTE'|'LT'|'LTE'|'IS_MISSING';
    field:FlowField;value?:string|number|boolean}
export type FlowBlock={
  blockKey:string;kind:'INSTRUMENT'|'MATERIAL'|'END';
  instrumentKey?:string;title?:string;body?:string;
  when?:FlowCondition;termination?:'COMPLETE_EARLY'|'SCREEN_OUT'
}
export type FlowDraft={
  schemaVersion:1
  experiment?:{
    experimentKey:string;linkedPolicy:'KEEP_LINKED'|'RERANDOMIZE';
    groups:{groupKey:string;weight:number;materialTitle:string;materialBody:string}[]
  }
  embeddedData:{key:string;type:'STRING'|'NUMBER'|'BOOLEAN';source:'STATIC';value:string|number|boolean}[]
  blocks:FlowBlock[]
}
export type PublicFlow={
  schemaVersion:1;flowDigest:string;planDigest:string;
  selectedMaterial?:{blockKey:'assigned_material';title:string;body:string}
  embeddedData:{key:string;type:'STRING'|'NUMBER'|'BOOLEAN';value:string|number|boolean}[]
  blocks:FlowBlock[]
}
export type FlowPublicUnit={
  kind:'FORM'|'SCALE'|'SJT';instrumentKey:string;
  pages?:{questions:{itemKey:string;displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string};
    rows?:{rowKey:string}[];otherOptionKey?:string}[]}[]
}
export function evaluateClientFlowCondition(condition:FlowCondition,
  checked:Record<string,Record<string,unknown>>,
  vars:Record<string,string|number|boolean>):boolean{
  if('terms' in condition)return condition.op==='AND'
    ?condition.terms.every(c=>evaluateClientFlowCondition(c,checked,vars))
    :condition.terms.some(c=>evaluateClientFlowCondition(c,checked,vars))
  if('term' in condition)return !evaluateClientFlowCondition(condition.term,checked,vars)
  const raw=condition.field.source==='EMBEDDED'?vars[condition.field.key]:
    checked[condition.field.instrumentKey]?.[condition.field.itemKey]
  if(condition.op==='IS_MISSING')return raw===null||raw===undefined||raw===''||
    (Array.isArray(raw)&&raw.length===0)
  if(raw===null||raw===undefined)return false
  if(condition.op==='INCLUDES')return Array.isArray(raw)&&raw.includes(condition.value)
  if(condition.op==='EQUALS')return raw===condition.value
  if(typeof raw!=='number'||typeof condition.value!=='number')return false
  if(condition.op==='GT')return raw>condition.value
  if(condition.op==='GTE')return raw>=condition.value
  if(condition.op==='LT')return raw<condition.value
  return raw<=condition.value
}
/** Client only previews the live route. The backend reconstructs everything
 * from verified, frozen answers on submission and rejects mismatches.
 */
export function resolveClientSurveyFlow(flow:PublicFlow,
  units:readonly FlowPublicUnit[],allAnswers:Record<string,Record<string,unknown>>){
  const vars=Object.fromEntries(flow.embeddedData.map(v=>[v.key,v.value]))
  const byKey=new Map(units.map(unit=>[unit.instrumentKey,unit]))
  const verified:Record<string,Record<string,unknown>>={}
  const active:FlowBlock[]=[]
  const shownBlocks:string[]=[]
  if(flow.selectedMaterial){
    shownBlocks.push(flow.selectedMaterial.blockKey)
    active.push({blockKey:flow.selectedMaterial.blockKey,kind:'MATERIAL',
      title:flow.selectedMaterial.title,body:flow.selectedMaterial.body})
  }
  let termination:'COMPLETE'|'COMPLETE_EARLY'|'SCREEN_OUT'='COMPLETE'
  for(const block of flow.blocks){
    if(block.when&&!evaluateClientFlowCondition(block.when,verified,vars))continue
    shownBlocks.push(block.blockKey)
    active.push(block)
    if(block.kind==='END'){
      termination=block.termination==='SCREEN_OUT'?'SCREEN_OUT':'COMPLETE_EARLY'
      break
    }
    if(block.kind==='INSTRUMENT'){
      const unit=byKey.get(block.instrumentKey??'')
      if(!unit)continue
      const raw=allAnswers[unit.instrumentKey]??{}
      verified[unit.instrumentKey]=unit.kind==='FORM'
        ?sanitizeFormAnswers(unit.pages?.flatMap(p=>p.questions)??[],raw):raw
    }
  }
  return {blocks:active,shownBlocks,termination,
    visibleUnitKeys:active.filter(b=>b.kind==='INSTRUMENT').map(b=>b.instrumentKey!)}
}
