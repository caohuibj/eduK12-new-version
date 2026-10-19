import { z } from 'zod'
import { assessmentKeySchema as key } from '../definition-primitives'

const text=z.string().trim().max(8000)
export const flowScalarSchema=z.union([z.string().max(200),z.number().finite(),z.boolean()])
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
    field,value:flowScalarSchema.optional()}).strict(),
]))
export const flowBlockSchema=z.object({
  blockKey:key,kind:z.enum(['INSTRUMENT','MATERIAL','END']),
  instrumentKey:key.optional(),title:text.optional(),body:text.optional(),
  when:flowConditionSchema.optional(),
  termination:z.enum(['COMPLETE_EARLY','SCREEN_OUT']).optional(),
}).strict()

export type FlowBlock=z.infer<typeof flowBlockSchema>
export type FlowCompileIssue={path:string;message:string}
export class FlowDefinitionError extends Error {
  constructor(readonly issues:FlowCompileIssue[]){super('流程定义未通过安全编译')}
}
const failFlow=(issues:FlowCompileIssue[]):never=>{throw new FlowDefinitionError(issues)}

/** Preflight untrusted recursive input before schema parsing. */
export function guardFlowShape(input:unknown, fail:(issues:FlowCompileIssue[])=>never=failFlow,
  budget:{maxDepth?:number;maxNodes?:number}={}){
  let nodes=0
  const active=new WeakSet<object>()
  const visit=(node:unknown,depth:number):void=>{
    if(node===null||typeof node!=='object')return
    if(depth>(budget.maxDepth??14)||++nodes>(budget.maxNodes??1500))
      fail([{path:'flow',message:'流程条件嵌套深度或节点数超过输入预算'}])
    if(active.has(node))
      fail([{path:'flow',message:'流程定义不能包含循环结构'}])
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

/** Legacy Survey evaluation semantics are intentionally unchanged. Training uses explicit facts. */
export type FlowScalar=string|number|boolean|null|undefined
export function evaluateFlowCondition(condition:FlowCondition,
  verified:Record<string,Record<string,unknown>>,staticValues:Record<string,FlowScalar>):boolean{
  if('terms' in condition)return condition.op==='AND'
    ?condition.terms.every(t=>evaluateFlowCondition(t,verified,staticValues))
    :condition.terms.some(t=>evaluateFlowCondition(t,verified,staticValues))
  if('term' in condition)return !evaluateFlowCondition(condition.term,verified,staticValues)
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
