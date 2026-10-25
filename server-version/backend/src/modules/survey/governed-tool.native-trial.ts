import {randomUUID} from 'node:crypto'
import {prepareSituationalFinalSubmission,deriveSituationalFinalFacts} from '../situational/situational-final-submit.service'
import {deriveAuthoritativeSituationalTrajectory} from '../situational/situation-trajectory'
import {deriveSituationalAssignment} from '../situational/situation-assignment'
import {situationalResponseHistoryIdentities} from '../situational/situation-research-capture'
import type {SituationalResearchCapture} from '../situational/situation-scientific-contract'
import type {SituationalResponse} from '../situational/situation-scoring'
import type {SituationalAttemptRow} from '../situational/situational-runtime.service'
import {frozenSurveyNativeSituationalRuntime} from './situational-native.definition'
import {SURVEY_NATIVE_SJT_PROTOCOL} from './situational-native.contract'
import {decodeSurveySituationalResult} from './situational-native.results'
import type {ResearchFrozenUnit} from './publication.service'

/** Generates synthetic participant input only. All path, capture, runtime,
 * scoring, canonical receipt and parent-result verification stays shared with
 * native FINAL. No human Attempt, Training record or second scorer is created. */
export function syntheticNativeSituationalSubmission(unit:ResearchFrozenUnit,index:number,id:string){
 const {header,snapshot}=frozenSurveyNativeSituationalRuntime(unit),definition=snapshot.definition
 const responses:SituationalResponse[]=[],events:SituationalResearchCapture['events']=[],visited=new Set<string>()
 let relativeTimeMs=0
 while(visited.size<definition.scenes.length){
  const path=deriveAuthoritativeSituationalTrajectory(definition,responses),sceneKey=path.sceneKeys.find(key=>!visited.has(key))
  if(!sceneKey)break
  visited.add(sceneKey)
  const scene=definition.scenes.find(s=>s.sceneKey===sceneKey)!
  const node=definition.schemaVersion===2?definition.flow.nodes.find(n=>n.nodeType==='SCENE'&&n.sceneKey===sceneKey):undefined
  const historyIdentity=definition.schemaVersion===2?situationalResponseHistoryIdentities(definition,responses).get(sceneKey):undefined
  const base=node?.nodeType==='SCENE'?{nodeKey:node.nodeKey,historyIdentity:historyIdentity!}:null
  if(base)events.push({type:'NODE_EXPOSED',...base,relativeTimeMs:relativeTimeMs++})
  const stages=node?.nodeType==='SCENE'&&node.responseStages?node.responseStages:[{channelKeys:scene.channels.map(c=>c.channelKey)}]
  for(const stage of stages){
   const stageBase=base?{...base,...('stageKey'in stage?{stageKey:stage.stageKey}:{})}:null
   if(stageBase&&'kind'in stage&&stage.kind!=='CHOICE')events.push({type:'PROBE_EXPOSED',...stageBase,relativeTimeMs:relativeTimeMs++})
   for(const key of stage.channelKeys){
    const channel=scene.channels.find(c=>c.channelKey===key)!
    const options=channel.responseType==='SINGLE_CHOICE'?channel.options.filter(o=>!o.nonanswerReason):[]
    const responseValue=channel.responseType==='SINGLE_CHOICE'?options[index%options.length]?.optionKey:channel.responseType==='CONTINUOUS'?channel.range.min+(channel.range.max-channel.range.min)*index/2:'synthetic'.slice(0,channel.maxLength)
    if(responseValue===undefined)throw new Error('原生试运行没有可用的合成选项：'+sceneKey+'/'+key)
    responses.push({sceneKey,channelKey:key,responseValue,...(historyIdentity?{historyIdentity,responseRevision:1,stageConfirmed:true}:{})})
    if(stageBase)events.push({type:'RESPONSE_FIRST_COMMITTED',...stageBase,channelKey:key,responseValue,responseRevision:1,relativeTimeMs:relativeTimeMs++})
   }
   if(stageBase&&'stageKey'in stage)events.push({type:'STAGE_CONFIRMED',...stageBase,relativeTimeMs:relativeTimeMs++})
  }
  if(base)events.push({type:'NODE_CONFIRMED',...base,relativeTimeMs:relativeTimeMs++})
 }
 const researchCapture:SituationalResearchCapture|undefined=definition.schemaVersion===2?{captureVersion:'situational-capture-v1',definitionHash:header.definitionHash,assignmentIdentity:deriveSituationalAssignment(definition,id,header.definitionHash).assignmentIdentity,events}:undefined
 return {responses,...(researchCapture?{researchCapture}:{})}
}

export function computeGovernedNativeTrial(unit:ResearchFrozenUnit,index:number){
 const {header,snapshot}=frozenSurveyNativeSituationalRuntime(unit)
 const id=randomUUID(),submissionId=randomUUID(),now=new Date(),scope={surveyAttemptId:'synthetic-governance',surveyPublicationId:'synthetic-governance'}
 const row:SituationalAttemptRow={id,...scope,surveySlotKey:unit.instrumentKey,userId:null,compositeAttemptId:null,compositeItemId:null,compositeSlotKey:null,compositeAttempt:null,compositeItem:null,participantKey:'synthetic-governance',
  instrumentKey:header.instrumentKey,instrumentVersion:header.instrumentVersion,definitionHash:header.definitionHash,compiledRuntimeHash:header.compiledRuntimeHash,scorerKey:header.scorerKey,scoringVersion:header.scoringVersion,
  attemptEpoch:1,attemptNo:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',frozenAt:new Date(header.frozenAt),runtimeSnapshotEncrypted:'',submissionId:null,submissionPayloadHash:null,submittedAt:null,progress:0,startedAt:now,completedAt:null,totalTime:null,resultEncrypted:null,canonicalResultEncrypted:null,createdAt:now,updatedAt:now}
 const input={attemptId:id,submissionId,attemptEpoch:1,definitionHash:header.definitionHash,compiledRuntimeHash:header.compiledRuntimeHash,instrumentVersion:header.instrumentVersion,scoringVersion:header.scoringVersion,...syntheticNativeSituationalSubmission(unit,index,id)}
 const prepared=prepareSituationalFinalSubmission(input,{row,snapshot}),facts=deriveSituationalFinalFacts(prepared,'SITUATIONAL_ATTEMPT')
 const reference={protocol:SURVEY_NATIVE_SJT_PROTOCOL,attemptId:id,submissionId,payloadHash:prepared.payloadHash}
 const loaded=decodeSurveySituationalResult({...row,status:'COMPLETED',submissionId,submissionPayloadHash:prepared.payloadHash,completedAt:facts.completedAt,resultEncrypted:facts.encryptedResult,canonicalResultEncrypted:facts.encryptedCanonicalResult},reference,unit,scope)
 return {unitResult:loaded.unitResult,evidence:{synthetic:true,protocol:header.protocol,reference,raw:facts.rawPayload,canonicalResult:facts.canonicalResult}}
}
