import { SURVEY_NATIVE_SJT_PROTOCOL,surveySituationalExecutionProtocol,type SurveySituationalReceiptReference } from './situational-native.contract'
import {readSurveyScalePresentation,scalePresentationOptions} from './catalog-scale.presentation'
import { matchRawScoreFeedback } from '../scale/raw-score-feedback'
import type {SurveyFinalInterpretation} from './final-interpretation.service'
import { normalizeSurveySjtAnswers,scoreResearchSjtAnswers,SurveySjtAnswerError } from './sjt-runtime'
import type { SurveyCognitiveReference } from './cognitive.definition'
import { projectStoredMeasurement,type MeasurementResultV1 } from '../assessment-runtime/measurement-result'
import { canonicalHash } from '../assessment-runtime/canonical'
import { scoreScale } from '../scale/scale-scoring'
import { scoreSituationalModel } from '../situational/situation-model-resolver'
import { deriveAuthoritativeSituationalTrajectory } from '../situational/situation-trajectory'
import { asLinearSituationDefinition } from '../situational/situation-runtime-definition'
import { resolveSurveySjtAnswer } from './sjt-selection'
import {validateSurveyScaleTimings,type SurveyScaleTimings} from './timing.definition'
import { executeSurveyFlow,SurveyFlowExecutionError,type SurveyExecutionTrace } from './flow.runtime'
import type { SurveyFlowAssignment } from './flow.assignment'
import { assertSurveyDraft, type FormDraft, type SjtDraft, type SjtDraftV2 } from './builder.definition'
import type { ResearchFrozenPublication, ResearchFrozenUnit } from './publication.service'
import type { ScaleDefinitionV2 } from '../scale/scale-definition'
import type { SituationDefinitionV2 } from '../situational/situation-branching'
import type { SituationalResponse } from '../situational/situation-scoring'

import { FormAnswerValidationError as SurveyFinalValidationError, parseAnswerMap as safeObject,
  type AnswerPrimitive, type AnswerMap, type MissingItem } from '../assessment-core/form/answers'
import { normalizeFormAnswers } from '../assessment-core/form/runtime'
export { FormAnswerValidationError as SurveyFinalValidationError } from '../assessment-core/form/answers'
export type { ExplicitFormRefusal as ExplicitSurveyRefusal, AnswerPrimitive, AnswerMap, MissingItem } from '../assessment-core/form/answers'
function invalid(path:string,message:string): never {throw new SurveyFinalValidationError(path,message)}
export interface FrozenUnitResult {
  instrumentKey:string
  kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE'
  sourceDigest:string
  scoringDigest:string|null
  rawAnswers:AnswerMap
  missing:MissingItem[]
  privateScoring:unknown|null
  childReference?:SurveyCognitiveReference
  nativeReference?:SurveySituationalReceiptReference
  measurement?:MeasurementResultV1
  /** PRESENT only when the entire frozen tool was not reached by Flow V1. */
  notExecuted?:true
}
export interface SurveyComputedFinal {
  interpretation?:SurveyFinalInterpretation
  schemaVersion:1
  definitionDigest:string
  units:FrozenUnitResult[]
  executionTrace?:SurveyExecutionTrace
  /** Optional browser-observed timing metadata; never used by scoring. */
  itemTimings?:SurveyScaleTimings
}
const formResult=(unit:ResearchFrozenUnit,answers:AnswerMap):FrozenUnitResult=>{
  // Legacy frozen operator/budget allowances remain exclusive to stored readers.
  const definition=assertSurveyDraft('FORM',unit.displayDefinition,true,true) as FormDraft
  return {instrumentKey:unit.instrumentKey,kind:'FORM',sourceDigest:unit.sourceDigest,
    scoringDigest:null,...normalizeFormAnswers(definition,answers),privateScoring:null}
}
/** No Attempt, participant, FINAL or quota writes. Shares the exact frozen Form validator. */
export function dryRunSurveyForm(definition:unknown,answers:unknown){
  const normalized=assertSurveyDraft('FORM',definition,true) as FormDraft
  // Strict authoring validation already succeeded; do not parse it a second time.
  return normalizeFormAnswers(normalized,safeObject(answers,'answers'))
}
const scaleResult=(unit:ResearchFrozenUnit,answers:AnswerMap,computeScore=true):FrozenUnitResult=>{
  const display=readSurveyScalePresentation(unit.displayDefinition)
  const allowed=new Set(display.items.map(q=>q.itemKey))
  for(const k of Object.keys(answers))if(!allowed.has(k))invalid('answers.'+k,'无效量表题目')
  const raw:Record<string,string>={}
  const missing:MissingItem[]=[]
  for(const item of display.items){
    const value=answers[item.itemKey]
    if((value===undefined||value===null||value==='')&&!item.required){
      missing.push({itemKey:item.itemKey,reason:'SHOWN_MISSING'});continue
    }
    if(typeof value!=='string'||!scalePresentationOptions(display,item).some(o=>o.optionKey===value))
      invalid('answers.'+item.itemKey,'研究量表必须完整选择有效的响应选项')
    raw[item.itemKey]=value as string
  }
  if(!computeScore)return {instrumentKey:unit.instrumentKey,kind:'SCALE',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:raw,missing,privateScoring:null}
  const mapping=unit.sourceAnswerMapping
  const nativeAnswers:Record<string,string|number>=mapping?Object.fromEntries(Object.entries(raw).map(([key,value])=>{
    const originalItem=mapping.items[key],originalValue=mapping.options[value]
    if(!originalItem||originalValue===undefined)invalid('answers.'+key,'量表来源映射不完整')
    return [originalItem,originalValue]
  })):raw
  const result=scoreScale(unit.compiledDefinition as ScaleDefinitionV2,nativeAnswers)
  if(result.quality.status==='invalid')invalid('scoring','量表数据不足以计算研究得分')
  return {instrumentKey:unit.instrumentKey,kind:'SCALE',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:raw,missing,privateScoring:{...result,
      ...((unit.compiledDefinition as ScaleDefinitionV2).report?.rawScoreFeedback ? {rawScoreFeedback:result.scores.flatMap(score=>{
        if(score.status!=='calculated')return []
        const match=matchRawScoreFeedback((unit.compiledDefinition as ScaleDefinitionV2).report.rawScoreFeedback,score.key,score.value)
        return match?[match]:[]
      })}:{}),
    }}
}
const sjtResult=(unit:ResearchFrozenUnit,answers:AnswerMap,computeScore=true):FrozenUnitResult=>{
  if((unit.displayDefinition as {schemaVersion:number}).schemaVersion===2){
    const display=assertSurveyDraft('SJT',unit.displayDefinition,true) as SjtDraftV2
    const definition=unit.compiledDefinition as SituationDefinitionV2
    try{
      const normalized=normalizeSurveySjtAnswers(display,definition,answers,{requireComplete:true})
      if(!computeScore)return {instrumentKey:unit.instrumentKey,kind:'SJT',sourceDigest:unit.sourceDigest,
        scoringDigest:unit.scoringDigest,rawAnswers:normalized.rawAnswers,missing:normalized.missing,privateScoring:null}
      const scored=scoreResearchSjtAnswers(display,definition,normalized.responses)
      const privateScoring={...scored,questionResults:normalized.questionResults}
      return {instrumentKey:unit.instrumentKey,kind:'SJT',sourceDigest:unit.sourceDigest,
        scoringDigest:unit.scoringDigest,rawAnswers:normalized.rawAnswers,
        missing:normalized.missing,privateScoring,
        measurement:projectStoredMeasurement({identity:{schemaVersion:1,kind:'SJT',
          sourceDigest:unit.sourceDigest,scoringDigest:unit.scoringDigest,
          engineVersion:'SURVEY_SJT_V2',scoringVersion:display.scoring.modelVersion,
          protocolDigest:null},storedResult:privateScoring})}
    }catch(error){
      if(error instanceof SurveySjtAnswerError)invalid(error.path,error.message)
      throw error
    }
  }
  const display=assertSurveyDraft('SJT',unit.displayDefinition,true) as SjtDraft
  const allowed=new Set(display.questions.map(q=>q.questionKey))
  for(const k of Object.keys(answers))if(!allowed.has(k))invalid('answers.'+k,'无效 SJT 题目')
  const definition=unit.compiledDefinition as SituationDefinitionV2
  const responses:SituationalResponse[]=[]
  const raw:Record<string,string|string[]>={}
  for(const q of display.questions){
    let chosen:{scorerOptionKey:string;frozenResponse:string|string[]}
    try{chosen=resolveSurveySjtAnswer(q,answers[q.questionKey])}
    catch(e){invalid('answers.'+q.questionKey,e instanceof Error?e.message:'不合法的情境选择')}
    const choice=chosen.scorerOptionKey
    const channels=definition.scenes.flatMap(scene=>scene.channels
      .filter(channel=>channel.channelKey===q.questionKey)
      .map(channel=>({scene,channel})))
    if(choice===null||channels.length!==1)invalid('answers.'+q.questionKey,'冻结 SJT 问题定义不明确')
    responses.push({sceneKey:channels[0].scene.sceneKey,channelKey:q.questionKey,responseValue:choice})
    raw[q.questionKey]=chosen.frozenResponse
  }
  const journey=deriveAuthoritativeSituationalTrajectory(definition,responses)
  if(!journey.reachedTerminal)invalid('answers','未完成情境要求的所有合法步骤')
  if(!computeScore)return {instrumentKey:unit.instrumentKey,kind:'SJT',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:raw,missing:[],privateScoring:null}
  const scores=scoreSituationalModel(asLinearSituationDefinition(definition),responses)
  if(scores.quality.status==='invalid')invalid('scoring','情境数据无法生成受控研究结果')
  return {instrumentKey:unit.instrumentKey,kind:'SJT',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:raw,missing:[],privateScoring:scores}
}
/** Shared ordinary-unit validator for cognitive admission. It validates the
 * reached prefix without trusting caller-provided scoring or requiring timing. */
export function validateSurveyUnitAnswers(unit:ResearchFrozenUnit,answer:unknown):Pick<FrozenUnitResult,'rawAnswers'|'missing'> {
  const raw=safeObject(answer,'answers.'+unit.instrumentKey)
  const normalized=unit.kind==='FORM'?formResult(unit,raw)
    :unit.kind==='SCALE'?scaleResult(unit,raw,false)
      :unit.kind==='SJT'?sjtResult(unit,raw,false)
        :invalid('answers.'+unit.instrumentKey,'认知工具必须通过专用会话完成')
  // This result cannot be used as an authoritative scored FINAL. Scoring runs
  // only when the reached ordinary units are committed in the parent FINAL.
  return {rawAnswers:normalized.rawAnswers,missing:normalized.missing}
}
/** A request-local proof owns its frozen copy. Its compute closure is the only
 * route that can reuse this digest; callers cannot supply a trusted hash to the
 * ordinary scorer. No authorization, Attempt state or result is cached. */
export function verifySurveyFinalPublication(snapshot:ResearchFrozenPublication,expectedDigest:string){
  const frozen=JSON.parse(JSON.stringify(snapshot)) as ResearchFrozenPublication
  const definitionDigest=canonicalHash(frozen)
  if(definitionDigest!==expectedDigest)return null
  const freeze=(value:unknown):void=>{
    if(!value||typeof value!=='object'||Object.isFrozen(value))return
    for(const child of Object.values(value))freeze(child)
    Object.freeze(value)
  }
  freeze(frozen)
  return Object.freeze({snapshot:frozen,
    compute:(input:Record<string,unknown>,assignment?:SurveyFlowAssignment|null,
      clientObservedBlocks?:readonly string[],mode:'FINAL'|'SCREEN_OUT'='FINAL',itemTimings?:unknown,
      cognitiveResults?:ReadonlyMap<string,FrozenUnitResult>,nativeSituationalResults?:ReadonlyMap<string,FrozenUnitResult>)=>
      computeSurveyFinalFromSnapshot(frozen,input,assignment,clientObservedBlocks,mode,itemTimings,definitionDigest,cognitiveResults,nativeSituationalResults),
  })
}

export function computeSurveyFinal(snapshot:ResearchFrozenPublication,input:Record<string,unknown>,
  assignment?:SurveyFlowAssignment|null,clientObservedBlocks?:readonly string[],
  mode:'FINAL'|'SCREEN_OUT'='FINAL',itemTimings?:unknown):SurveyComputedFinal{
  return computeSurveyFinalFromSnapshot(snapshot,input,assignment,clientObservedBlocks,mode,itemTimings)
}

function computeSurveyFinalFromSnapshot(snapshot:ResearchFrozenPublication,input:Record<string,unknown>,
  assignment?:SurveyFlowAssignment|null,clientObservedBlocks?:readonly string[],
  mode:'FINAL'|'SCREEN_OUT'='FINAL',itemTimings?:unknown,verifiedDigest?:string,
  cognitiveResults?:ReadonlyMap<string,FrozenUnitResult>,nativeSituationalResults?:ReadonlyMap<string,FrozenUnitResult>):SurveyComputedFinal{
  for(const unit of snapshot.units)if(unit.kind==='SJT'||unit.executionProtocol!==undefined)surveySituationalExecutionProtocol(unit)
  const nativeSituationalResult=(unit:ResearchFrozenUnit,raw:AnswerMap):FrozenUnitResult=>{
    if(Object.keys(raw).length)invalid('answers.'+unit.instrumentKey,'原生情境化答案只能通过共享工具协议提交')
    const result=nativeSituationalResults?.get(unit.instrumentKey)
    if(!result||result.kind!=='SJT'||result.nativeReference?.protocol!==SURVEY_NATIVE_SJT_PROTOCOL
      ||result.sourceDigest!==unit.sourceDigest||result.scoringDigest!==unit.scoringDigest)
      invalid('answers.'+unit.instrumentKey,'情境化任务缺少已验证的正式子结果')
    return result
  }
  const cognitiveResult=(unit:ResearchFrozenUnit,raw:AnswerMap):FrozenUnitResult=>{
    if(Object.keys(raw).length)invalid('answers.'+unit.instrumentKey,'认知原始试次只能由受控子会话提交')
    const result=cognitiveResults?.get(unit.instrumentKey)
    if(!result||result.kind!=='COGNITIVE'||!result.childReference||
      result.sourceDigest!==unit.sourceDigest||result.scoringDigest!==unit.scoringDigest)
      invalid('answers.'+unit.instrumentKey,'认知任务缺少已验证的正式子结果')
    return result
  }
  if(snapshot.schemaVersion!==1||snapshot.purpose!=='RESEARCH_ONLY'||
     snapshot.runtimeStatus!=='SURVEY_FINAL_V1'||!snapshot.units.length)
    invalid('publication','尚未提供可执行的 Survey 专用冻结定义')
  if(snapshot.flow){
    if(snapshot.units.some(unit=>unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL)
      &&snapshot.flow.experiment?.mode==='QUESTIONNAIRE_VARIANTS')
      invalid('publication','原生情境化父流程尚不支持问卷子版本分配')
    if(!assignment)invalid('flow.assignment','冻结流程缺少已持久化的实验分配')
    let result
    try{
      result=executeSurveyFlow({snapshot,answers:input,assignment,
        clientObservedBlocks:clientObservedBlocks??[],
        evaluateUnit:(unit,answer)=>{
          const raw=safeObject(answer,'answers.'+unit.instrumentKey)
          try{
            if(unit.kind==='FORM')return formResult(unit,raw)
            if(unit.kind==='SCALE')return scaleResult(unit,raw)
            if(unit.kind==='COGNITIVE')return cognitiveResult(unit,raw)
            return unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL?nativeSituationalResult(unit,raw):sjtResult(unit,raw)
          }catch(e){
            if(e instanceof SurveyFinalValidationError&&e.path.startsWith('answers.'))
              invalid('answers.'+unit.instrumentKey+'.'+e.path.slice(8),e.message)
            throw e
          }
        },
      })
    }catch(e){
      if(e instanceof SurveyFlowExecutionError)invalid(e.path,e.message)
      throw e
    }
    if(result.trace.termination==='SCREEN_OUT'&&mode!=='SCREEN_OUT')
      invalid('flow','本研究路径为资格筛除，不能生成有效 FINAL')
    if(result.trace.termination!=='SCREEN_OUT'&&mode==='SCREEN_OUT')
      invalid('flow','当前路径不能标记为资格筛除')
    const verifiedTimings=validateSurveyScaleTimings(snapshot,input,itemTimings,mode==='FINAL')
    return {schemaVersion:1,
      definitionDigest:verifiedDigest??canonicalHash(JSON.parse(JSON.stringify(snapshot))),
      units:result.units,executionTrace:result.trace,
      ...(verifiedTimings?{itemTimings:verifiedTimings}:{})}
  }
  if(mode==='SCREEN_OUT')invalid('flow','旧研究定义不支持资格筛除')
  if(Object.keys(input).length!==snapshot.units.length)
    invalid('answers','提交的研究工具数量与发布定义不一致')
  const units=snapshot.units.map(unit=>{
    if(!Object.prototype.hasOwnProperty.call(input,unit.instrumentKey))
      invalid('answers.'+unit.instrumentKey,'缺少研究工具作答')
    const raw=safeObject(input[unit.instrumentKey],'answers.'+unit.instrumentKey)
    if(unit.kind==='FORM'){
      try{return formResult(unit,raw)}
      catch(e){
        if(e instanceof SurveyFinalValidationError&&e.path.startsWith('answers.'))
          invalid('answers.'+unit.instrumentKey+'.'+e.path.slice('answers.'.length),e.message)
        throw e
      }
    }
    if(unit.kind==='SCALE')return scaleResult(unit,raw)
    if(unit.kind==='SJT')return unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL
      ?nativeSituationalResult(unit,raw):sjtResult(unit,raw)
    if(unit.kind==='COGNITIVE')return cognitiveResult(unit,raw)
    return invalid('publication','未知研究内容类型')
  })
  const definitionDigest=verifiedDigest??canonicalHash(JSON.parse(JSON.stringify(snapshot)))
  const verifiedTimings=validateSurveyScaleTimings(snapshot,input,itemTimings,true)
  return {schemaVersion:1,definitionDigest,units,
    ...(verifiedTimings?{itemTimings:verifiedTimings}:{})}
}
