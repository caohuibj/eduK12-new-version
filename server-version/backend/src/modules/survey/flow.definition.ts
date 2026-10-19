import { materialExperimentSchema as experiment,validateMaterialExperiment,groupHasMaterial } from '../assessment-core/materials/definition'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { surveyKeySchema } from './builder.definition'
import { flowBlockSchema as block,flowScalarSchema as scalar,guardFlowShape as guardSharedFlowShape } from '../assessment-core/flow/definition'
import { strictFlowKeys as strictKeys,flowError as error,validateFlowBlocks } from '../assessment-core/flow/compiler'
export { flowConditionSchema,evaluateFlowCondition } from '../assessment-core/flow/definition'
export type { FlowField,FlowCondition,FlowScalar } from '../assessment-core/flow/definition'
import type { FlowScalar } from '../assessment-core/flow/definition'
import type { ResearchFrozenUnit } from './publication.service'
import { cognitiveDraftSchema } from './cognitive.definition'

const key=surveyKeySchema
export const surveyFlowDraftSchema=z.object({
  schemaVersion:z.literal(1),
  experiment:experiment.optional(),
  embeddedData:z.array(z.object({
    key,type:z.enum(['STRING','NUMBER','BOOLEAN']),
    source:z.literal('STATIC'),value:scalar,
  }).strict()).max(30).default([]),
  blocks:z.array(block).min(1).max(64),
}).strict()
export type SurveyFlowDraft=z.infer<typeof surveyFlowDraftSchema>
export type FrozenSurveyFlow=Omit<SurveyFlowDraft,'experiment'>&{flowDigest:string;
  experiment?: Omit<NonNullable<SurveyFlowDraft['experiment']>,'groups'>&{
    groups:Array<NonNullable<SurveyFlowDraft['experiment']>['groups'][number]&{variantDigest?:string}>
  }
}
export type SurveyVariantProvenance={
  schemaVersion:1;variantKey:string;variantLabel:string;variantDigest:string;
  allocationConfigId:string;weight:number;totalWeight:number;probability:number
}
/** Frozen group membership is authoritative. Never infer an arm from client answers. */
export function surveyVariantInstrumentKeys(flow:FrozenSurveyFlow,groupKey:string|null):Set<string>|null{
  if(flow.experiment?.mode!=='QUESTIONNAIRE_VARIANTS')return null
  const group=flow.experiment.groups.find(g=>g.groupKey===groupKey)
  if(!group?.instrumentKeys?.length||!group.variantDigest)
    throw new SurveyFlowError([{path:'flow.assignment',message:'问卷子版本分配与冻结定义不匹配'}])
  return new Set(group.instrumentKeys)
}
export function surveyAssignedFlowBlocks(flow:FrozenSurveyFlow,groupKey:string|null){
  const keys=surveyVariantInstrumentKeys(flow,groupKey)
  return keys?flow.blocks.filter(b=>b.kind!=='INSTRUMENT'||keys.has(b.instrumentKey!)):flow.blocks
}
export function surveyVariantProvenance(flow:FrozenSurveyFlow,groupKey:string|null):SurveyVariantProvenance|undefined{
  if(flow.experiment?.mode!=='QUESTIONNAIRE_VARIANTS')return undefined
  surveyVariantInstrumentKeys(flow,groupKey)
  const group=flow.experiment.groups.find(g=>g.groupKey===groupKey)!
  const totalWeight=flow.experiment.groups.reduce((n,g)=>n+g.weight,0)
  return {schemaVersion:1,variantKey:group.groupKey,variantLabel:group.variantLabel!,
    variantDigest:group.variantDigest!,allocationConfigId:flow.flowDigest,
    weight:group.weight,totalWeight,probability:group.weight/totalWeight}
}
export const surveyGroupHasMaterial=groupHasMaterial

export class SurveyFlowError extends Error {
  constructor(readonly issues:Array<{path:string;message:string}>){
    super('研究流程定义未通过安全编译')
  }
}
const guardFlowShape=(input:unknown)=>guardSharedFlowShape(input,issues=>{throw new SurveyFlowError(issues)})
export function parseSurveyFlowDraft(input:unknown):SurveyFlowDraft{
  guardFlowShape(input)
  return surveyFlowDraftSchema.parse(input)
}
export function compileSurveyFlow(input:unknown,units:readonly ResearchFrozenUnit[],
  collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'):FrozenSurveyFlow{
  guardFlowShape(input)
  const parsed=surveyFlowDraftSchema.safeParse(input)
  if(!parsed.success)throw new SurveyFlowError(parsed.error.issues.map(issue=>({
    path:issue.path.join('.')||'flow',message:issue.message,
  })))
  const flow=parsed.data
  const issues:SurveyFlowError['issues']=[]
  const unitMap=new Map(units.map(unit=>[unit.instrumentKey,unit]))
  const allUnitKeys=units.map(unit=>unit.instrumentKey)
  strictKeys(allUnitKeys,'instruments',issues)
  strictKeys(flow.blocks.map(b=>b.blockKey),'flow.blocks',issues)
  if(flow.experiment&&flow.blocks.some(b=>b.blockKey==='assigned_material'))
    error(issues,'flow.blocks','assigned_material 是研究实验材料保留标识，不能由编制者重用')
  strictKeys(flow.embeddedData.map(d=>d.key),'flow.embeddedData',issues)
  const staticVars=new Map(flow.embeddedData.map(d=>[d.key,d]))
  flow.embeddedData.forEach((v,i)=>{
    if(v.type==='STRING'?typeof v.value!=='string':
      v.type==='NUMBER'?typeof v.value!=='number':typeof v.value!=='boolean')
      error(issues,'flow.embeddedData.'+i+'.value','嵌入变量的类型和值不匹配')
  })
  validateMaterialExperiment(flow.experiment,{linked:collectionMode==='LINKED_WAVES',staticVars},issues)
  validateFlowBlocks({blocks:flow.blocks,units,staticVars},issues)
  if(issues.length)throw new SurveyFlowError(issues)
  if(flow.experiment?.mode==='QUESTIONNAIRE_VARIANTS'){
    const experiment=flow.experiment
    if(experiment.linkedPolicy!=='RERANDOMIZE')
      error(issues,'flow.experiment.linkedPolicy','问卷子版本只支持每波次独立概率分配')
    const covered=new Set<string>()
    for(const [i,group] of experiment.groups.entries()){
      const path='flow.experiment.groups.'+i
      if(!group.variantLabel||!group.instrumentKeys?.length){
        error(issues,path,'每个问卷子版本必须有名称和完整工具列表');continue
      }
      strictKeys(group.instrumentKeys,path+'.instrumentKeys',issues)
      for(const instrumentKey of group.instrumentKeys){
        covered.add(instrumentKey)
        if(!unitMap.has(instrumentKey))error(issues,path+'.instrumentKeys','子版本引用了未选择的研究工具')
      }
      const keys=new Set(group.instrumentKeys)
      const selected=units.filter(u=>keys.has(u.instrumentKey))
      const blocks=flow.blocks.filter(b=>b.kind!=='INSTRUMENT'||keys.has(b.instrumentKey!))
      try{
        compileSurveyFlow({schemaVersion:1,embeddedData:flow.embeddedData,blocks},selected,collectionMode)
      }catch(e){
        if(e instanceof SurveyFlowError)for(const issue of e.issues)
          error(issues,path+'.'+issue.path,issue.message)
        else throw e
      }
    }
    if(allUnitKeys.some(k=>!covered.has(k)))
      error(issues,'flow.experiment.groups','所有冻结工具必须明确归入至少一个问卷子版本')
    // One participant-facing cognitive feedback policy across all variants avoids
    // revealing a hidden arm through a different report release or metric contract.
    const feedback=units.filter(u=>u.kind==='COGNITIVE').map(u=>
      cognitiveDraftSchema.parse(u.displayDefinition).feedback)
    if(new Set(feedback.map(value=>canonicalHash(value))).size>1)
      error(issues,'flow.experiment.groups','各问卷子版本认知任务的反馈和发布策略必须一致')
    if(issues.length)throw new SurveyFlowError(issues)
    const frozenGroups=experiment.groups.map(group=>{
      const keys=new Set(group.instrumentKeys!)
      return {...group,variantDigest:canonicalHash(JSON.parse(JSON.stringify({schemaVersion:1,
        groupKey:group.groupKey,variantLabel:group.variantLabel,
        units:units.filter(u=>keys.has(u.instrumentKey)),
        blocks:flow.blocks.filter(b=>b.kind!=='INSTRUMENT'||keys.has(b.instrumentKey!)),
        embeddedData:flow.embeddedData,materialTitle:group.materialTitle,materialBody:group.materialBody,
      })))}
    })
    const frozen={...flow,experiment:{...experiment,groups:frozenGroups}}
    return {...frozen,flowDigest:canonicalHash(JSON.parse(JSON.stringify(frozen)))}
  }
  if(flow.experiment?.groups.some(g=>g.instrumentKeys!==undefined||g.variantLabel!==undefined))
    throw new SurveyFlowError([{path:'flow.experiment',message:'问卷子版本字段要求明确的子版本模式'}])
  const flowDigest=canonicalHash(JSON.parse(JSON.stringify(flow)))
  return {...flow,flowDigest}
}
export const staticFlowValues=(flow:FrozenSurveyFlow):Record<string,FlowScalar>=>
  Object.fromEntries(flow.embeddedData.map(v=>[v.key,v.value]))
export const safeFlowText=(source:string,flow:FrozenSurveyFlow):string=>{
  const values=staticFlowValues(flow)
  return source.replace(/\{\{([a-z][a-z0-9_-]*)\}\}/g,
    (_all,key:string)=>String(values[key]??''))
}
