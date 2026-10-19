import { assignedMaterial } from '../assessment-core/materials/definition'
import { surveySjtQuestions } from './sjt-structure'
import { canonicalHash } from '../assessment-runtime/canonical'
import { evaluateFlowCondition,staticFlowValues,safeFlowText,
  surveyAssignedFlowBlocks,type SurveyVariantProvenance,
  type FrozenSurveyFlow } from './flow.definition'
import type { ResearchFrozenPublication,ResearchFrozenUnit } from './publication.service'
import { assertSurveyFlowAssignment,type SurveyFlowAssignment } from './flow.assignment'
import type { FrozenUnitResult,MissingItem } from './final.compute'
export class SurveyFlowExecutionError extends Error{
  constructor(readonly path:string,message:string){super(message)}
}
function fail(path:string,message:string):never{throw new SurveyFlowExecutionError(path,message)}
export type FlowPresentationBlock={
  blockKey:string;kind:'INSTRUMENT'|'MATERIAL'|'END';
  instrumentKey?:string;title?:string;body?:string;
  termination?:'COMPLETE_EARLY'|'SCREEN_OUT'
}
export type SurveyExecutionTrace={
  schemaVersion:1;flowDigest:string;assignmentDigest:string;
  algorithm:SurveyFlowAssignment['algorithm'];experimentKey:string|null;groupKey:string|null;
  variant?:SurveyVariantProvenance;assignedAt?:string;
  shownBlocks:string[];skippedInstrumentKeys:string[];
  termination:'COMPLETE'|'COMPLETE_EARLY'|'SCREEN_OUT'
  endBlockKey:string|null
  /** Browser-confirmed current presentation order, not independent evidence
   * that pixels were seen or attention was paid. */
  clientPresentation:'VERIFIED_SUBMISSION'
}
export type FlowPlanResult={
  trace:SurveyExecutionTrace
  units:FrozenUnitResult[]
  presentation:FlowPresentationBlock[]
}
const missingUnit=(unit:ResearchFrozenUnit):FrozenUnitResult=>{
  const missing:MissingItem[]=[]
  if(unit.kind==='FORM'){
    const d=unit.displayDefinition as import('./builder.definition').FormDraft
    for(const page of d.pages)for(const q of page.questions){
      if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
        for(const row of q.rows)missing.push({itemKey:q.itemKey+':'+row.rowKey,reason:'NOT_SHOWN'})
      }else missing.push({itemKey:q.itemKey,reason:'NOT_SHOWN'})
      if(q.otherOptionKey)missing.push({itemKey:q.itemKey+':other',reason:'NOT_SHOWN'})
    }
  }else if(unit.kind==='SCALE'){
    const d=unit.displayDefinition as import('./builder.definition').ScaleDraft
    for(const q of d.items)missing.push({itemKey:q.itemKey,reason:'NOT_SHOWN'})
  }else if(unit.kind==='SJT'){
    const d=unit.displayDefinition as import('./builder.definition').AnySjtDraft
    for(const q of surveySjtQuestions(d))missing.push({itemKey:q.questionKey,reason:'NOT_SHOWN'})
  }
  return {instrumentKey:unit.instrumentKey,kind:unit.kind,sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:{},missing,
    privateScoring:null,notExecuted:true}
}
/** Reconstruct authoritative displayed instrument order from previously VERIFIED
 * answers, never unvalidated client state. All other units get NOT_SHOWN.
 */
export function executeSurveyFlow(input:{
  snapshot:ResearchFrozenPublication;answers:Record<string,unknown>;
  assignment:SurveyFlowAssignment;
  clientObservedBlocks:readonly string[];
  evaluateUnit:(unit:ResearchFrozenUnit,answers:unknown)=>FrozenUnitResult;
}):FlowPlanResult{
  const flow=input.snapshot.flow
  if(!flow)fail('flow','旧发布没有研究流程')
  if(input.assignment.flowDigest!==flow.flowDigest
    ||input.assignment.experimentKey!==(flow.experiment?.experimentKey??null)
    ||(input.assignment.groupKey!==null&&!flow.experiment?.groups.some(g=>
      g.groupKey===input.assignment.groupKey)))
    fail('flow.assignment','Attempt 实验分配与冻结研究内容不匹配')
  assertSurveyFlowAssignment(flow,input.assignment)
  const byKey=new Map(input.snapshot.units.map(unit=>[unit.instrumentKey,unit]))
  const seen=new Set<string>(),verified:Record<string,Record<string,unknown>>={}
  const shown:string[]=[],presentation:FlowPresentationBlock[]=[]
  const results=new Map<string,FrozenUnitResult>()
  let termination:SurveyExecutionTrace['termination']='COMPLETE'
  let endBlockKey:string|null=null
  const group=flow.experiment?.groups.find(g=>g.groupKey===input.assignment.groupKey)
  if(flow.experiment&&!group)fail('flow.assignment','当前试验组不存在于冻结实验配置')
  const material=assignedMaterial(flow.experiment,input.assignment.groupKey,source=>safeFlowText(source,flow))
  if(material){
    shown.push(material.blockKey)
    presentation.push({blockKey:material.blockKey,kind:'MATERIAL',title:material.title,body:material.body})
  }
  const vars=staticFlowValues(flow)
  for(const block of surveyAssignedFlowBlocks(flow,input.assignment.groupKey)){
    if(block.when&&!evaluateFlowCondition(block.when,verified,vars))continue
    shown.push(block.blockKey)
    if(block.kind==='MATERIAL'){
      presentation.push({blockKey:block.blockKey,kind:'MATERIAL',
        title:safeFlowText(block.title??'',flow),body:safeFlowText(block.body??'',flow)})
    }else if(block.kind==='END'){
      termination=block.termination==='SCREEN_OUT'?'SCREEN_OUT':'COMPLETE_EARLY'
      endBlockKey=block.blockKey
      presentation.push({blockKey:block.blockKey,kind:'END',termination:block.termination,
        title:block.title??(termination==='SCREEN_OUT'?'不满足本研究的参与条件':'本轮内容已结束')})
      break
    }else{
      const unit=byKey.get(block.instrumentKey!)
      if(!unit)fail('flow.blocks','不存在的冻结研究工具')
      if(seen.has(unit.instrumentKey))fail('flow.blocks','重复执行的冻结研究工具')
      seen.add(unit.instrumentKey)
      if(!Object.prototype.hasOwnProperty.call(input.answers,unit.instrumentKey))
        fail('answers.'+unit.instrumentKey,'缺少此流程必须完成的研究工具')
      const result=input.evaluateUnit(unit,input.answers[unit.instrumentKey])
      results.set(unit.instrumentKey,result)
      verified[unit.instrumentKey]=result.rawAnswers
      presentation.push({blockKey:block.blockKey,kind:'INSTRUMENT',instrumentKey:unit.instrumentKey})
    }
  }
  const extras=Object.keys(input.answers).filter(k=>!seen.has(k))
  if(extras.length)fail('answers.'+extras[0],'此工具不属于实际展示并验证通过的研究路径')
  if(termination==='COMPLETE_EARLY'&&!seen.size)
    fail('flow','无作答的提前完成不可生成有效研究 FINAL；请使用 SCREEN_OUT')
  if(!Array.isArray(input.clientObservedBlocks)
    ||input.clientObservedBlocks.length!==shown.length
    ||shown.some((name,i)=>input.clientObservedBlocks[i]!==name)
    ||new Set(input.clientObservedBlocks).size!==shown.length)
    fail('presentation','浏览器确认的展示路径与权威研究路径不匹配，请复核问卷后提交')
  const ordered=input.snapshot.units.map(u=>results.get(u.instrumentKey)??missingUnit(u))
  const trace:SurveyExecutionTrace={
    schemaVersion:1,flowDigest:flow.flowDigest,
    assignmentDigest:canonicalHash(input.assignment),algorithm:input.assignment.algorithm,
    experimentKey:input.assignment.experimentKey,groupKey:input.assignment.groupKey,
    shownBlocks:shown,skippedInstrumentKeys:ordered.filter(x=>x.notExecuted).map(x=>x.instrumentKey),
    ...(input.assignment.variant?{variant:input.assignment.variant,assignedAt:input.assignment.assignedAt}:{}),
    termination,endBlockKey,clientPresentation:'VERIFIED_SUBMISSION',
  }
  return {trace,units:ordered,presentation}
}
export const buildSurveyFlowPublicProjection=(flow:FrozenSurveyFlow,assignment:SurveyFlowAssignment)=>{
  assertSurveyFlowAssignment(flow,assignment)
  const material=assignedMaterial(flow.experiment,assignment.groupKey,source=>safeFlowText(source,flow))
  return {
    schemaVersion:1 as const,flowDigest:flow.flowDigest,
    ...(material?{selectedMaterial:material}:{}),
    embeddedData:flow.embeddedData.map(v=>({key:v.key,value:v.value,type:v.type})),
    blocks:surveyAssignedFlowBlocks(flow,assignment.groupKey).map(b=>({
      blockKey:b.blockKey,kind:b.kind,instrumentKey:b.instrumentKey,
      title:b.kind==='MATERIAL'?safeFlowText(b.title??'',flow):b.title,
      body:b.kind==='MATERIAL'?safeFlowText(b.body??'',flow):undefined,
      when:b.when,termination:b.termination,
    })),
  }
}
