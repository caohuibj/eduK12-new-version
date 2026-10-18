import type { AssessmentImagePresentationItem } from '../assessment-media/types'
import type { SjtQuestion, SjtDraftV2 } from '../assessment-core/sjt/types'
import type { SituationalAttemptResponse, SituationalDraftAnswer, SituationalRunnerChannel, SituationalRunnerDefinition } from './types'
export type PublicOnlineQuestion = Omit<SjtQuestion,'options'> & {options:Array<Omit<SjtQuestion['options'][number],'contributions'>>}
export type OnlineFrozenDisplay = {responseProtocol:'sjt-online-response-v1';compilerVersion:string;definitionHash:string;displayHash:string;display:{title:string;respondentType:SjtDraftV2['respondentType'];scenes:Array<{sceneKey:string;title:string;stimulus:string;image?:AssessmentImagePresentationItem;questions:PublicOnlineQuestion[]}>}}
/** UI projection uses only the server's frozen public document, never the current authoring draft. */
export function onlineRunnerDefinition(online:OnlineFrozenDisplay):SituationalRunnerDefinition {
 return {schemaVersion:1,respondentType:online.display.respondentType,sampling:{strategy:'ALL'},scenes:online.display.scenes.flatMap(s=>s.questions.map(q=>({sceneKey:'sjt_q_'+q.questionKey,title:s.title,sortOrder:0,stimulus:s.image ? {type:'IMAGE' as const,text:s.stimulus,asset:{assetId:s.image.asset.assetId,contentHash:s.image.asset.contentHash,mimeType:s.image.asset.mimeType},altText:s.image.altText,...(s.image.caption?{caption:s.image.caption}:{})} : {type:'TEXT_V1' as const,text:s.stimulus},channels:[{channelKey:q.questionKey,prompt:q.prompt,responseType:q.responseType==='MULTIPLE'?'MULTIPLE_CHOICE' as const:'SINGLE_CHOICE' as const,...(!q.required?{required:false as const}:{}),options:q.options.map(o=>({optionKey:o.optionKey,label:o.label})),allowRefusal:q.allowRefusal,minSelections:q.minSelections,maxSelections:q.maxSelections,exclusiveOptionKeys:[...(q.exclusiveOptionKeys??[]),...q.options.filter(o=>o.nonanswerReason).map(o=>o.optionKey)],online:true}]}))).map((scene,index)=>({...scene,sortOrder:index}))}
}
export function withOnlineRunner(data:SituationalAttemptResponse):SituationalAttemptResponse {return data.instrument.online?{...data,instrument:{...data.instrument,definition:onlineRunnerDefinition(data.instrument.online)}}:data}
export function onlineAnswerComplete(channel:SituationalRunnerChannel,answer?:SituationalDraftAnswer):boolean {
 if(!channel.online)return answer!==undefined
 if(!answer||answer.status==='BLANK')return channel.required===false
 if(answer.status==='REFUSED')return channel.allowRefusal===true
 const value=answer.responseValue
 if(channel.responseType!=='MULTIPLE_CHOICE')return typeof value==='string'&&Boolean(channel.options?.some(o=>o.optionKey===value))
 if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length||value.some(k=>!channel.options?.some(o=>o.optionKey===k)))return false
 const exclusive=value.some(k=>channel.exclusiveOptionKeys?.includes(k))
 return exclusive?value.length===1:value.length>=(channel.minSelections??1)&&value.length<=(channel.maxSelections??6)
}
export function onlineResponses(definition:SituationalRunnerDefinition,answers:Record<string,SituationalDraftAnswer>){return definition.scenes.flatMap(s=>s.channels.map(c=>{const a=answers[`${s.sceneKey}:${c.channelKey}`];const status=a?.status??(a?'ANSWERED':'BLANK');return {sceneKey:s.sceneKey,channelKey:c.channelKey,status,...(status==='ANSWERED'?{responseValue:a?.responseValue}:{}),...(a?.responseTimeMs===undefined?{}:{responseTimeMs:a.responseTimeMs}),...(a?.answeredAt?{answeredAt:a.answeredAt}:{})}}))}
