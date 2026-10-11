import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { surveyKeySchema, type FormDraft } from './builder.definition'
import type { ResearchFrozenUnit } from './publication.service'

const key=surveyKeySchema
const text=z.string().trim().max(8000)
const scalar=z.union([z.string().max(200),z.number().finite(),z.boolean()])
const field=z.discriminatedUnion('source',[
  z.object({source:z.literal('ANSWER'),instrumentKey:key,itemKey:key}).strict(),
  z.object({source:z.literal('EMBEDDED'),key}).strict(),
])
export type FlowField=z.infer<typeof field>
export type FlowCondition=
  | {op:'AND'|'OR';terms:FlowCondition[]}
  | {op:'NOT';term:FlowCondition}
  | {op:'EQUALS'|'INCLUDES'|'GT'|'GTE'|'LT'|'LTE'|'IS_MISSING';
    field:FlowField;value?:string|number|boolean}
export const flowConditionSchema:z.ZodType<FlowCondition>=z.lazy(()=>z.union([
  z.object({op:z.enum(['AND','OR']),terms:z.array(flowConditionSchema).min(1).max(8)}).strict(),
  z.object({op:z.literal('NOT'),term:flowConditionSchema}).strict(),
  z.object({op:z.enum(['EQUALS','INCLUDES','GT','GTE','LT','LTE','IS_MISSING']),
    field,value:scalar.optional()}).strict(),
]))
const block=z.object({
  blockKey:key,kind:z.enum(['INSTRUMENT','MATERIAL','END']),
  instrumentKey:key.optional(),title:text.optional(),body:text.optional(),
  when:flowConditionSchema.optional(),
  termination:z.enum(['COMPLETE_EARLY','SCREEN_OUT']).optional(),
}).strict()
const experiment=z.object({
  experimentKey:key,linkedPolicy:z.enum(['KEEP_LINKED','RERANDOMIZE']),
  groups:z.array(z.object({
    groupKey:key,weight:z.number().int().min(1).max(100),
    materialTitle:text,materialBody:text,
  }).strict()).min(2).max(8),
}).strict()
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
export type FrozenSurveyFlow=SurveyFlowDraft&{flowDigest:string}
export class SurveyFlowError extends Error {
  constructor(readonly issues:Array<{path:string;message:string}>){
    super('研究流程定义未通过安全编译')
  }
}
const error=(issues:SurveyFlowError['issues'],path:string,message:string)=>
  issues.push({path,message})
const strictKeys=(values:string[],path:string,issues:SurveyFlowError['issues'])=>{
  const seen=new Set<string>()
  for(let i=0;i<values.length;i++){
    if(seen.has(values[i]))error(issues,path+'.'+i,'流程标识必须唯一')
    seen.add(values[i])
  }
}
/** Guard recursive AST input before Zod's lazy parser recurses. Bounded even
 * for malicious deeply nested JSON or cyclic values passed by internal code.
 * No research answers or persistent state are touched by this preflight. */
function guardFlowShape(input:unknown){
  let nodes=0
  const active=new WeakSet<object>()
  const visit=(node:unknown,depth:number):void=>{
    if(node===null||typeof node!=='object')return
    if(depth>14||++nodes>1500)
      throw new SurveyFlowError([{path:'flow',message:'流程条件嵌套深度或节点数超过输入预算'}])
    if(active.has(node))
      throw new SurveyFlowError([{path:'flow',message:'流程定义不能包含循环结构'}])
    active.add(node)
    if(Array.isArray(node)){
      for(const value of node)visit(value,depth+1)
    }else{
      for(const value of Object.values(node))visit(value,depth+1)
    }
    active.delete(node)
  }
  visit(input,0)
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
  strictKeys(flow.embeddedData.map(d=>d.key),'flow.embeddedData',issues)
  const staticVars=new Map(flow.embeddedData.map(d=>[d.key,d]))
  flow.embeddedData.forEach((v,i)=>{
    if(v.type==='STRING'?typeof v.value!=='string':
      v.type==='NUMBER'?typeof v.value!=='number':typeof v.value!=='boolean')
      error(issues,'flow.embeddedData.'+i+'.value','嵌入变量的类型和值不匹配')
  })
  if(flow.experiment){
    strictKeys(flow.experiment.groups.map(g=>g.groupKey),'flow.experiment.groups',issues)
    if(flow.experiment.linkedPolicy==='KEEP_LINKED'&&collectionMode!=='LINKED_WAVES')
      error(issues,'flow.experiment.linkedPolicy','不关联匿名研究不能保持跨波次分组')
    const sum=flow.experiment.groups.reduce((n,g)=>n+g.weight,0)
    if(sum>800)error(issues,'flow.experiment.groups','实验随机权重总和超限')
    if(!flow.experiment.groups.every(g=>g.materialTitle.trim()&&g.materialBody.trim()))
      error(issues,'flow.experiment.groups','各实验组必须提供完整展示材料')
  }
  const visited=new Set<string>()
  let terminalFound=false
  let guaranteedStarted=false
  let totalPredicates=0
  const checkText=(raw:string|undefined,path:string)=>{
    if(!raw)return
    for(const match of raw.matchAll(/\{\{([a-z][a-z0-9_-]*)\}\}/g)){
      if(!staticVars.has(match[1]))
        error(issues,path,'受控文案引用了未声明的静态变量 '+match[1])
    }
    if(/\{\{|\}\}/.test(raw.replace(/\{\{[a-z][a-z0-9_-]*\}\}/g,'')))
      error(issues,path,'文案变量必须使用 {{变量编码}}，不允许执行表达式')
  }
  const checkCondition=(condition:FlowCondition,at:number,depth:number,path:string)=>{
    totalPredicates++
    if(totalPredicates>64||depth>6){error(issues,path,'条件表达式节点或深度超过上限');return}
    if(condition.op==='AND'||condition.op==='OR'){
      condition.terms.forEach((term,i)=>checkCondition(term,at,depth+1,path+'.terms.'+i))
      return
    }
    if(condition.op==='NOT'){checkCondition(condition.term,at,depth+1,path+'.term');return}
    const compare=condition.op
    const v=condition.value
    if(compare==='IS_MISSING'&&v!==undefined)
      error(issues,path,'空值判断不得包含比较值')
    if(compare!=='IS_MISSING'&&v===undefined)
      error(issues,path,'比较条件必须包含明确的比较值')
    let valueType:'choice'|'choices'|'number'|'text'|'boolean'|null=null
    let validOptions:string[]=[]
    if(condition.field.source==='EMBEDDED'){
      const e=staticVars.get(condition.field.key)
      if(!e){error(issues,path,'条件引用了未知嵌入变量');return}
      valueType=e.type==='NUMBER'?'number':e.type==='BOOLEAN'?'boolean':'text'
    }else{
      if(!visited.has(condition.field.instrumentKey)){
        error(issues,path,'条件只能引用流程中此前已定义的 Form 工具，不能引用自身或未来答案')
        return
      }
      const unit=unitMap.get(condition.field.instrumentKey)
      if(!unit||unit.kind!=='FORM'){
        error(issues,path,'研究条件仅可引用已验证的 Form 答案');return
      }
      const form=unit.displayDefinition as FormDraft
      const item=form.pages.flatMap(p=>p.questions)
        .find(q=>q.itemKey===condition.field.itemKey)
      if(!item){error(issues,path,'被引用的表单题目不存在');return}
      if(['NUMBER','SLIDER'].includes(item.type))valueType='number'
      else if(item.type==='MULTIPLE')valueType='choices'
      else if(['SINGLE','LIKERT'].includes(item.type))valueType='choice'
      else if(['SHORT_TEXT','LONG_TEXT','DATE','TIME'].includes(item.type))valueType='text'
      else{error(issues,path,'不支持用矩阵、排序或恒定总和直接决定流程分支');return}
      validOptions=item.options.map(o=>o.optionKey)
    }
    if(compare==='IS_MISSING')return
    if(compare==='GT'||compare==='GTE'||compare==='LT'||compare==='LTE'){
      if(valueType!=='number'||typeof v!=='number')
        error(issues,path,'数值比较只允许 NUMBER/SLIDER 或数字型嵌入变量')
    }else if(compare==='INCLUDES'){
      if(valueType!=='choices'||typeof v!=='string'||!validOptions.includes(v))
        error(issues,path,'INCLUDES 必须引用多选题及其合法选项编码')
    }else if(compare==='EQUALS'){
      if(valueType==='choices'||typeof v!==(valueType==='number'?'number':
        valueType==='boolean'?'boolean':'string'))
        error(issues,path,'比较值类型与 Form/变量字段不一致')
      if(valueType==='choice'&&!validOptions.includes(String(v)))
        error(issues,path,'选项编码不属于被引用的题目')
    }
  }
  flow.blocks.forEach((b,i)=>{
    const path='flow.blocks.'+i
    if(terminalFound)error(issues,path,'END 之后的流程块不可执行，请删除')
    if(b.when)checkCondition(b.when,i,0,path+'.when')
    if(b.kind==='INSTRUMENT'){
      if(!b.instrumentKey||!unitMap.has(b.instrumentKey))
        error(issues,path+'.instrumentKey','工具块须引用此波次选中的研究工具编码')
      if(b.instrumentKey&&visited.has(b.instrumentKey))
        error(issues,path+'.instrumentKey','同一个工具不能重复执行')
      if(b.instrumentKey)visited.add(b.instrumentKey)
      if(!b.when&&b.instrumentKey&&unitMap.has(b.instrumentKey))guaranteedStarted=true
      if(b.title!==undefined||b.body!==undefined||b.termination!==undefined)
        error(issues,path,'工具块不允许携带素材或结束参数')
    }else if(b.kind==='MATERIAL'){
      if(b.instrumentKey!==undefined||b.termination!==undefined||!b.body?.trim())
        error(issues,path,'素材块只允许标题和非空正文')
      checkText(b.title,path+'.title');checkText(b.body,path+'.body')
    }else{
      if(!b.termination||b.instrumentKey!==undefined||b.body!==undefined)
        error(issues,path,'END 必须声明终止类别，且不可执行工具或素材')
      if(!b.when)error(issues,path+'.when','END 必须包含明确条件，避免意外终止全部被试')
      if(!guaranteedStarted)
        error(issues,path,'提前结束或资格筛除前必须有至少一个无条件执行的研究工具')
      if(b.termination==='SCREEN_OUT'&&![...visited].some(key=>unitMap.get(key)?.kind==='FORM'))
        error(issues,path,'筛除必须依据先前已收集的 Form 条件')
      terminalFound=!b.when // conditional END can be followed by another block
    }
  })
  for(const unit of allUnitKeys)if(!visited.has(unit))
    error(issues,'flow.blocks','所有冻结研究工具必须在流程中准确出现一次：'+unit)
  if(issues.length)throw new SurveyFlowError(issues)
  const flowDigest=canonicalHash(JSON.parse(JSON.stringify(flow)))
  return {...flow,flowDigest}
}
export type FlowScalar=string|number|boolean|null|undefined
export function evaluateFlowCondition(condition:FlowCondition,
  verified:Record<string,Record<string,unknown>>,staticValues:Record<string,FlowScalar>):boolean{
  if(condition.op==='AND')return condition.terms.every(t=>evaluateFlowCondition(t,verified,staticValues))
  if(condition.op==='OR')return condition.terms.some(t=>evaluateFlowCondition(t,verified,staticValues))
  if(condition.op==='NOT')return !evaluateFlowCondition(condition.term,verified,staticValues)
  const raw=condition.field.source==='EMBEDDED'?staticValues[condition.field.key]:
    verified[condition.field.instrumentKey]?.[condition.field.itemKey]
  if(condition.op==='IS_MISSING')
    return raw===null||raw===undefined||raw===''||(Array.isArray(raw)&&!raw.length)
  if(raw===undefined||raw===null)return false
  if(condition.op==='INCLUDES')return Array.isArray(raw)&&raw.includes(condition.value)
  if(condition.op==='EQUALS')return raw===condition.value
  if(typeof raw!=='number'||typeof condition.value!=='number')return false
  if(condition.op==='GT')return raw>condition.value
  if(condition.op==='GTE')return raw>=condition.value
  if(condition.op==='LT')return raw<condition.value
  return raw<=condition.value
}
export const staticFlowValues=(flow:FrozenSurveyFlow):Record<string,FlowScalar>=>
  Object.fromEntries(flow.embeddedData.map(v=>[v.key,v.value]))
export const safeFlowText=(source:string,flow:FrozenSurveyFlow):string=>{
  const values=staticFlowValues(flow)
  return source.replace(/\{\{([a-z][a-z0-9_-]*)\}\}/g,
    (_all,key:string)=>String(values[key]??''))
}
