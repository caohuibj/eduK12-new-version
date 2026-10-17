import type { AnySjtDraft } from './builder.definition'
import type { SituationDefinitionV2 } from '../situational/situation-branching'
import type { SituationalResponse } from '../situational/situation-scoring'
import { scoreSituationalModel } from '../situational/situation-model-resolver'
import { asLinearSituationDefinition } from '../situational/situation-runtime-definition'
import { resolveSurveySjtAnswer } from './sjt-selection'
import { surveySjtQuestionEntries } from './sjt-structure'

export type SurveySjtRawResponse=string|string[]|{_surveyRefusal:true}
export type SurveySjtMissingReason='SHOWN_MISSING'|'REFUSED'|'UNABLE_TO_JUDGE'
export type SurveySjtQuestionResult={questionKey:string;motherSceneKey:string;
  scorerOptionKey:string|null;response:SurveySjtRawResponse|null;
  status:'ANSWERED'|SurveySjtMissingReason}
export class SurveySjtAnswerError extends Error {
  constructor(readonly path:string,message:string){super(message);this.name='SurveySjtAnswerError'}
}
const refusal=(value:unknown):value is {_surveyRefusal:true}=>!!value&&typeof value==='object'
  &&!Array.isArray(value)&&Object.keys(value).length===1
  &&(value as {_surveyRefusal?:unknown})._surveyRefusal===true

/** Validate against display semantics, then map only substantive choices to the
 * shared scorer. Legal missingness is observable data, never a numeric zero. */
export function normalizeSurveySjtAnswers(display:AnySjtDraft,definition:SituationDefinitionV2,
  answers:Record<string,unknown>,options:{requireComplete?:boolean}={}) {
  const fail=(path:string,message:string):never=>{throw new SurveySjtAnswerError(path,message)}
  if(!answers||typeof answers!=='object'||Array.isArray(answers))fail('answers','SJT 答案必须为问题编码映射')
  const entries=surveySjtQuestionEntries(display)
  const allowed=new Set(entries.map(x=>x.question.questionKey))
  for(const key of Object.keys(answers))if(!allowed.has(key))fail('answers.'+key,'无效 SJT 题目')
  const responses:SituationalResponse[]=[]
  const rawAnswers:Record<string,SurveySjtRawResponse>={}
  const missing:Array<{itemKey:string;reason:SurveySjtMissingReason}>=[]
  const questionResults:SurveySjtQuestionResult[]=[]
  type ChannelMatch={scene:SituationDefinitionV2['scenes'][number];channel:SituationDefinitionV2['scenes'][number]['channels'][number]}
  const channelsByQuestion=new Map<string,ChannelMatch|null>()
  for(const scene of definition.scenes)for(const channel of scene.channels)
    channelsByQuestion.set(channel.channelKey,channelsByQuestion.has(channel.channelKey)?null:{scene,channel})
  for(const {question:q,motherSceneKey} of entries){
    const path='answers.'+q.questionKey
    const value=Object.prototype.hasOwnProperty.call(answers,q.questionKey)?answers[q.questionKey]:undefined
    const matched=channelsByQuestion.get(q.questionKey)
    if(!matched)fail(path,'冻结 SJT 问题定义不明确')
    const recordMissing=(reason:SurveySjtMissingReason,response:SurveySjtRawResponse|null)=>{
      if(response!==null)rawAnswers[q.questionKey]=response
      missing.push({itemKey:q.questionKey,reason})
      questionResults.push({questionKey:q.questionKey,motherSceneKey,scorerOptionKey:null,response,status:reason})
    }
    if(display.schemaVersion===2){
      if(refusal(value)){
        if(!q.allowRefusal)fail(path,'本题不允许显式拒答')
        recordMissing('REFUSED',{_surveyRefusal:true});continue
      }
      if(value===undefined||value===null||(q.responseType==='MULTIPLE'&&Array.isArray(value)&&value.length===0)){
        if(q.required&&options.requireComplete!==false)fail(path,'必答 SJT 问题尚未完成')
        recordMissing('SHOWN_MISSING',null);continue
      }
    }else if(value===undefined&&options.requireComplete===false){
      recordMissing('SHOWN_MISSING',null);continue
    }
    let chosen:ReturnType<typeof resolveSurveySjtAnswer>
    try{chosen=resolveSurveySjtAnswer(q,value)}catch(e){fail(path,e instanceof Error?e.message:'不合法的情境选择')}
    const raw=chosen!.frozenResponse
    const nonanswer=typeof raw==='string'?q.options.find(o=>o.optionKey===raw)?.nonanswerReason
      :raw.length===1?q.options.find(o=>o.optionKey===raw[0])?.nonanswerReason:undefined
    if(nonanswer&&display.schemaVersion===2){
      recordMissing(nonanswer==='DECLINED'?'REFUSED':'UNABLE_TO_JUDGE',raw);continue
    }
    const {scene,channel}=matched!
    if(channel.responseType!=='SINGLE_CHOICE'||!channel.options.some(o=>o.optionKey===chosen!.scorerOptionKey))
      fail(path,'SJT 选择与冻结计分选项不一致')
    responses.push({sceneKey:scene.sceneKey,channelKey:q.questionKey,responseValue:chosen!.scorerOptionKey})
    rawAnswers[q.questionKey]=raw
    questionResults.push({questionKey:q.questionKey,motherSceneKey,
      scorerOptionKey:chosen!.scorerOptionKey,response:raw,status:'ANSWERED'})
  }
  return {responses,rawAnswers,missing,questionResults}
}

/** Only V2 corrects independent-scene coverage. V1 retains its frozen semantics. */
export function scoreResearchSjtAnswers(display:AnySjtDraft,definition:SituationDefinitionV2,
  responses:SituationalResponse[]) {
  const mapping=display.schemaVersion===2?Object.fromEntries(definition.flow.nodes
    .flatMap(node=>node.nodeType==='SCENE'?[[node.sceneKey,node.motherSceneKey]]:[])):undefined
  return scoreSituationalModel(asLinearSituationDefinition(definition),responses,
    mapping?{independentSceneKeyBySceneKey:mapping}:{})
}
