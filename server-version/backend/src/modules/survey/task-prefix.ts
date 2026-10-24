import {assertSurveyFlowAssignment,type SurveyFlowAssignment} from './flow.assignment'
import {surveyAssignedFlowBlocks} from './flow.definition'
import type { Prisma } from '@prisma/client'
import {prepareCanonicalSubmission,assertCanonicalSubmissionPayloadSize} from '../../services/instrumentFinalSubmit'
import type {VerifiedSurveyTask} from './task-authority'
import type {ResearchFrozenPublication} from './publication.service'
import {validateSurveyUnitAnswers} from './final.compute'
import {evaluateFlowCondition,staticFlowValues} from './flow.definition'
import {SURVEY_NATIVE_SJT_PROTOCOL,SurveySituationalProtocolError} from './situational-native.contract'
import {loadCompletedSurveySituationalPrefix} from './situational-native.results'
import {cognitiveFail,assertSurveyPriorCognitiveCompleted,assertSurveyCognitiveLockedAnswers} from './cognitive.results'
type Tx=Prisma.TransactionClient
type Known=VerifiedSurveyTask
const jsonCopy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
/** Prove reachability with normalized ordinary answers, then preserve their original canonical values.
 * Earlier cognitive units must already have a committed child result, never client metrics. */
export function prepareSurveyCognitivePriorAnswers(input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))cognitiveFail(400,'认知开始需要前置答案对象')
  const answers=input as Record<string,unknown>
  // Bound untrusted nesting before canonicalization or any task validator recurses.
  let nodes=0
  const active=new WeakSet<object>()
  const guard=(value:unknown,depth:number):void=>{
    if(++nodes>300000||depth>4)cognitiveFail(400,'认知前置答案结构超过安全预算')
    if(value===null||typeof value==='string'||typeof value==='boolean')return
    if(typeof value==='number'&&Number.isFinite(value))return
    if(!value||typeof value!=='object'||active.has(value))cognitiveFail(400,'认知前置答案包含无效值')
    active.add(value as object)
    const children=Array.isArray(value)?value:Object.values(value as object)
    if(children.length>500)cognitiveFail(400,'认知前置答案字段数超限')
    for(const child of children)guard(child,depth+1)
    active.delete(value as object)
  }
  if(Object.keys(answers).length>30)cognitiveFail(400,'认知前置工具数超限')
  guard(answers,0)
  const canonical=prepareCanonicalSubmission(answers)
  assertCanonicalSubmissionPayloadSize(canonical,900000,'认知前置答案')
  return {answers,canonical}
}
export async function freezeSurveyTaskPrefix(tx:Tx,known:Known,snapshot:ResearchFrozenPublication,slotKey:string,input:unknown,assignment?:SurveyFlowAssignment|null){
  const {answers}=prepareSurveyCognitivePriorAnswers(input)
  const verified:Record<string,Record<string,unknown>>={},locked:Record<string,unknown>={}
  const units=new Map(snapshot.units.map(u=>[u.instrumentKey,u]))
  if(snapshot.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'&&Object.keys(answers).some(key=>!units.has(key)))
    cognitiveFail(400,'认知前置答案不属于当前问卷子版本')
  if(snapshot.flow){
    if(!assignment)cognitiveFail(409,'冻结前置路径缺少服务器持久化分配')
    assertSurveyFlowAssignment(snapshot.flow,assignment!)
  }
  const blocks=snapshot.flow?surveyAssignedFlowBlocks(snapshot.flow,assignment!.groupKey):snapshot.units.map(u=>({kind:'INSTRUMENT',instrumentKey:u.instrumentKey,when:undefined}))
  const vars=snapshot.flow?staticFlowValues(snapshot.flow):{}
  const priorCognitive:string[]=[],priorSituational:string[]=[]
  for(const block of blocks){
    if(block.when&&!evaluateFlowCondition(block.when,verified,vars))continue
    if(block.kind==='END')break
    if(block.kind!=='INSTRUMENT')continue
    const unit=units.get(block.instrumentKey!)
    if(!unit)cognitiveFail(409,'冻结认知路径含有不存在的工具')
    if(unit!.instrumentKey===slotKey){
      await assertSurveyPriorCognitiveCompleted(tx,{projectId:known.projectId,waveId:known.waveId,
        attemptId:known.attemptId,publicationId:known.publicationId},priorCognitive)
      try{await loadCompletedSurveySituationalPrefix(tx,{surveyAttemptId:known.attemptId,
        surveyPublicationId:known.publicationId,snapshot,slotKeys:priorSituational})}
      catch(error){if(error instanceof SurveySituationalProtocolError)cognitiveFail(409,error.code);throw error}
      await assertSurveyCognitiveLockedAnswers(tx,known.attemptId,answers)
      return jsonCopy(locked)
    }
    if(unit!.kind==='COGNITIVE'){
      priorCognitive.push(unit!.instrumentKey)
    }else if(unit!.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL){
      if(Object.prototype.hasOwnProperty.call(answers,unit!.instrumentKey))
        cognitiveFail(400,'原生情境化前置事实必须使用服务器已保存回执，不能作为普通答案传入')
      priorSituational.push(unit!.instrumentKey)
    }else{
      if(!Object.prototype.hasOwnProperty.call(answers,unit!.instrumentKey))cognitiveFail(400,'请先完成认知任务之前的研究工具')
      const result=validateSurveyUnitAnswers(unit!,answers[unit!.instrumentKey])
      verified[unit!.instrumentKey]=result.rawAnswers
      locked[unit!.instrumentKey]=answers[unit!.instrumentKey]
    }
  }
  return cognitiveFail(409,'当前合法研究路径不会进入这个认知工具')
}
