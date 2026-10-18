import { z } from 'zod'
import { assessmentKeySchema } from '../definition-primitives'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { flowBlockSchema,guardFlowShape,FlowDefinitionError,evaluateFlowCondition,
  type FlowCompileIssue,type FlowCondition } from './definition'
import { strictFlowKeys,validateFlowBlocks,type FlowFormDefinition } from './compiler'

export type { FlowCondition } from './definition'
export type { FlowFormDefinition } from './compiler'
export type TrainingFlowUnit={
  instrumentKey:string;kind:'FORM'|'SCALE'|'COGNITIVE'|'SJT';required:boolean;
  definitionHash:string;displayDefinition?:FlowFormDefinition
}
export const trainingFlowUnitKey=(sectionId:string):string=>
  assessmentKeySchema.parse('section_'+sectionId.replace(/-/g,'_'))
export const trainingFlowItemKey=(itemId:string):string=>
  assessmentKeySchema.parse('item_'+itemId.replace(/-/g,'_'))
export const trainingFlowDraftSchema=z.object({
  schemaVersion:z.literal(1),blocks:z.array(flowBlockSchema).min(1).max(64),
}).strict()
export type TrainingFlowDraft=z.infer<typeof trainingFlowDraftSchema>
/** Part of the frozen protocol. In particular, NOT cannot turn a skipped source
 * into an executing block, and a pending FINAL is never an absent answer. */
export const TRAINING_FLOW_POLICY={
  schemaVersion:1,dependency:'ACCEPTED_ONLY',skippedDependency:'SKIP_WHOLE_CONDITION',
  completion:'VALID_MEASUREMENT_AND_ACCEPTED_REQUIRED_V1',material:'DISPLAY_ONLY',
  hiddenAnswer:'SKIP_WHOLE_CONDITION',refusedAnswer:'MISSING',
} as const
export type FrozenTrainingFlow=TrainingFlowDraft&{
  policy:typeof TRAINING_FLOW_POLICY;unionDigest:string;flowDigest:string
}
export class TrainingFlowError extends FlowDefinitionError {}
function fail(path:string,message:string):never {throw new TrainingFlowError([{path,message}])}
function failIssues(issues:FlowCompileIssue[]):never {throw new TrainingFlowError(issues)}
const jsonValue=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T
export function parseTrainingFlowDraft(input:unknown):TrainingFlowDraft{
  guardFlowShape(input,failIssues,{maxDepth:22})
  const parsed=trainingFlowDraftSchema.safeParse(input)
  if(!parsed.success)failIssues(parsed.error.issues.map(issue=>({
    path:issue.path.join('.')||'flow',message:issue.message,
  })))
  return parsed.data
}
const formDefinitionSchema=z.object({pages:z.array(z.object({
  questions:z.array(z.object({itemKey:assessmentKeySchema,type:z.string(),
    options:z.array(z.object({optionKey:assessmentKeySchema}).passthrough()),
  }).passthrough()),
}).passthrough())}).passthrough()
const unitSchema=z.object({instrumentKey:assessmentKeySchema,
  kind:z.enum(['FORM','SCALE','COGNITIVE','SJT']),required:z.boolean(),
  definitionHash:z.string().regex(/^[a-f0-9]{64}$/),
  displayDefinition:formDefinitionSchema.optional(),
}).strict()
function checkUnits(units:readonly TrainingFlowUnit[]):void{
  const parsed=z.array(unitSchema).min(1).max(64).safeParse(units)
  if(!parsed.success)failIssues(parsed.error.issues.map(issue=>({
    path:'instruments.'+issue.path.join('.'),message:issue.message,
  })))
  const issues:FlowCompileIssue[]=[]
  strictFlowKeys(units.map(unit=>unit.instrumentKey),'instruments',issues)
  units.forEach((unit,index)=>{
    if(unit.kind==='FORM'){
      if(!unit.displayDefinition)issues.push({path:'instruments.'+index,
        message:'Form 流程工具必须绑定冻结题目定义'})
      else strictFlowKeys(unit.displayDefinition.pages.flatMap(page=>page.questions.map(q=>q.itemKey)),
        'instruments.'+index+'.items',issues)
    }
  })
  if(issues.length)failIssues(issues)
}
export function compileTrainingFlow(input:unknown,units:readonly TrainingFlowUnit[]):FrozenTrainingFlow{
  const flow=parseTrainingFlowDraft(input)
  checkUnits(units)
  const issues:FlowCompileIssue[]=[]
  strictFlowKeys(flow.blocks.map(block=>block.blockKey),'flow.blocks',issues)
  validateFlowBlocks({blocks:flow.blocks,units,choiceAnswersOnly:true},issues)
  if(issues.length)failIssues(issues)
  const frozen={...flow,policy:{...TRAINING_FLOW_POLICY},unionDigest:canonicalHash(jsonValue(units))}
  return {...frozen,flowDigest:canonicalHash(jsonValue(frozen))}
}
export type TrainingFlowAcceptedFact={
  status:'ACCEPTED';answers?:Record<string,unknown>;unavailableItemKeys?:string[];acceptedHash:string;
  requirementSatisfied:boolean;hasValidMeasurement:boolean
}
export type TrainingFlowFact=TrainingFlowAcceptedFact|{status:'PENDING'}|{status:'SKIPPED'}
export type TrainingFlowFacts=Readonly<Record<string,TrainingFlowFact>>
export type TrainingConditionResult='TRUE'|'FALSE'|'PENDING'|'SKIPPED'
const hasOwn=(record:object,key:string)=>Object.prototype.hasOwnProperty.call(record,key)
const getFact=(facts:TrainingFlowFacts,key:string):TrainingFlowFact|undefined=>
  hasOwn(facts,key)?facts[key]:undefined
/** Inspect every dependency before boolean evaluation. Explicit source skipping
 * suppresses the whole condition (including NOT/OR), as declared in policy. */
export function evaluateTrainingFlowCondition(condition:FlowCondition,facts:TrainingFlowFacts):TrainingConditionResult{
  const dependencies=new Set<string>()
  const hiddenDependencies:Array<{instrumentKey:string;itemKey:string}>=[]
  const visit=(node:FlowCondition):void=>{
    if('terms' in node){node.terms.forEach(visit);return}
    if('term' in node){visit(node.term);return}
    if(node.field.source!=='ANSWER')fail('flow.when','课程流程不支持嵌入变量')
    dependencies.add(node.field.instrumentKey)
    hiddenDependencies.push(node.field)
  }
  visit(condition)
  let pending=false
  const answers:Record<string,Record<string,unknown>>=Object.create(null)
  for(const key of dependencies){
    const fact=getFact(facts,key)
    if(fact?.status==='SKIPPED')return 'SKIPPED'
    if(!fact||fact.status==='PENDING'){pending=true;continue}
    answers[key]=Object.assign(Object.create(null),fact.answers??{})
  }
  for(const field of hiddenDependencies){const fact=getFact(facts,field.instrumentKey);if(fact?.status==='ACCEPTED'&&fact.unavailableItemKeys?.includes(field.itemKey))return 'SKIPPED'}
  if(pending)return 'PENDING'
  return evaluateFlowCondition(condition,answers,{})?'TRUE':'FALSE'
}
export type TrainingFlowSkipReason='CONDITION_FALSE'|'DEPENDENCY_SKIPPED'|'END_SCREEN_OUT'|'END_COMPLETE_EARLY'
export type TrainingFlowPath={
  schemaVersion:1;flowDigest:string;unionDigest:string;pathDigest:string;
  reachedInstrumentKeys:string[];acceptedInstrumentKeys:string[];currentInstrumentKey:string|null;
  materials:Array<{blockKey:string;kind:'MATERIAL';title?:string;body:string}>;
  shownBlocks:string[];skipped:Array<{instrumentKey:string;reason:TrainingFlowSkipReason}>;
  termination:'PENDING'|'COMPLETE'|'SCREEN_OUT'|'COMPLETE_EARLY';endBlockKey:string|null;
  taskSatisfaction:'PENDING'|'SATISFIED'|'NOT_SATISFIED';
  acceptedFacts:Array<{instrumentKey:string;acceptedHash:string;requirementSatisfied:boolean;hasValidMeasurement:boolean}>
}
const acceptedFactSchema=z.object({status:z.literal('ACCEPTED'),
  acceptedHash:z.string().min(1).max(256),answers:z.record(z.unknown()).optional(),unavailableItemKeys:z.array(assessmentKeySchema).max(500).optional(),
  requirementSatisfied:z.boolean(),hasValidMeasurement:z.boolean(),
}).strict()
/** Pure path reconstruction from server-accepted facts. Never mutate the frozen
 * candidate union, accept client branch decisions, or look beyond current tool.
 * The result is internal evidence: adapters expose only reached tools/materials,
 * never the skipped candidate identities or the frozen branch language. */
export function scanTrainingFlow(flow:FrozenTrainingFlow,units:readonly TrainingFlowUnit[],facts:TrainingFlowFacts):TrainingFlowPath{
  // Bind both all candidates and the exact frozen language/policy, without
  // compiling questions repeatedly on every server projection.
  if(canonicalHash(jsonValue(flow.policy))!==canonicalHash(TRAINING_FLOW_POLICY))
    fail('flow.policy','不支持或已改写的课程流程策略')
  if(canonicalHash(jsonValue(units))!==flow.unionDigest)
    fail('flow.unionDigest','课程流程与全部冻结工具定义不匹配')
  const {flowDigest,...bound}=flow
  if(canonicalHash(jsonValue(bound))!==flowDigest)fail('flow.flowDigest','课程流程摘要不匹配')
  const byKey=new Map(units.map(unit=>[unit.instrumentKey,unit]))
  for(const [key,fact] of Object.entries(facts)){
    if(!byKey.has(key))fail('facts.'+key,'事实引用了冻结候选之外的工具')
    if(!fact||!['ACCEPTED','PENDING','SKIPPED'].includes(fact.status))fail('facts.'+key,'未知的工具事实状态')
    if(fact.status==='ACCEPTED'&&!acceptedFactSchema.safeParse(fact).success)
      fail('facts.'+key,'已接受事实必须包含冻结 hash、任务满足状态和有效测量状态')
  }
  const reachedInstrumentKeys:string[]=[],acceptedInstrumentKeys:string[]=[],shownBlocks:string[]=[]
  const materials:TrainingFlowPath['materials']=[],skipped:TrainingFlowPath['skipped']=[]
  const acceptedFacts:TrainingFlowPath['acceptedFacts']=[]
  const resolved:Record<string,TrainingFlowFact>=Object.create(null)
  let currentInstrumentKey:string|null=null,endBlockKey:string|null=null
  let termination:TrainingFlowPath['termination']='COMPLETE'
  let anyValidMeasurement=false,acceptedRequiredSatisfied=true
  const skip=(instrumentKey:string,reason:TrainingFlowSkipReason)=>{
    if(getFact(facts,instrumentKey)?.status==='ACCEPTED')
      fail('facts.'+instrumentKey,'未执行的流程工具不能包含已接受事实')
    resolved[instrumentKey]={status:'SKIPPED'}
    skipped.push({instrumentKey,reason})
  }
  for(let index=0;index<flow.blocks.length;index++){
    const block=flow.blocks[index]
    const condition=block.when?evaluateTrainingFlowCondition(block.when,resolved):'TRUE'
    if(condition==='PENDING'){termination='PENDING';break}
    if(condition==='FALSE'||condition==='SKIPPED'){
      if(block.kind==='INSTRUMENT')skip(block.instrumentKey!,condition==='FALSE'?'CONDITION_FALSE':'DEPENDENCY_SKIPPED')
      continue
    }
    shownBlocks.push(block.blockKey)
    if(block.kind==='MATERIAL'){
      materials.push({blockKey:block.blockKey,kind:'MATERIAL',...(block.title!==undefined?{title:block.title}:{}),body:block.body!})
      continue
    }
    if(block.kind==='END'){
      endBlockKey=block.blockKey
      termination=block.termination!
      for(const remaining of flow.blocks.slice(index+1))if(remaining.kind==='INSTRUMENT')
        skip(remaining.instrumentKey!,termination==='SCREEN_OUT'?'END_SCREEN_OUT':'END_COMPLETE_EARLY')
      break
    }
    const key=block.instrumentKey!,unit=byKey.get(key)
    if(!unit)fail('flow.blocks.'+index,'流程工具不在冻结候选中')
    reachedInstrumentKeys.push(key)
    const fact=getFact(facts,key)
    if(!fact||fact.status!=='ACCEPTED'){
      if(fact?.status==='SKIPPED')fail('facts.'+key,'可达工具不能被外部跳过标志覆盖')
      currentInstrumentKey=key;termination='PENDING';break
    }
    resolved[key]=fact;acceptedInstrumentKeys.push(key)
    acceptedFacts.push({instrumentKey:key,acceptedHash:fact.acceptedHash,
      requirementSatisfied:fact.requirementSatisfied,hasValidMeasurement:fact.hasValidMeasurement})
    anyValidMeasurement ||= fact.hasValidMeasurement
    if(unit.required&&!fact.requirementSatisfied)acceptedRequiredSatisfied=false
  }
  for(const [key,fact] of Object.entries(facts))if(fact.status==='ACCEPTED'&&!acceptedInstrumentKeys.includes(key))
    fail('facts.'+key,'未来或未执行的流程工具不能包含已接受事实')
  const taskSatisfaction:TrainingFlowPath['taskSatisfaction']=termination==='PENDING'?'PENDING':
    termination==='SCREEN_OUT'||!anyValidMeasurement||!acceptedRequiredSatisfied?'NOT_SATISFIED':'SATISFIED'
  const path={schemaVersion:1 as const,flowDigest,unionDigest:flow.unionDigest,reachedInstrumentKeys,
    acceptedInstrumentKeys,currentInstrumentKey,materials,shownBlocks,skipped,termination,endBlockKey,
    taskSatisfaction,acceptedFacts}
  return {...path,pathDigest:canonicalHash(path)}
}
