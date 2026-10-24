import {isSurveySituationalReference,type SurveySituationalReference} from './survey-situational-api'
import type { SurveyCognitiveReference } from './survey-cognitive-api'
/** Short-lived same-tab Survey draft. Never persists in localStorage or
 * sends data during item navigation. Source+Attempt fence stale submissions.
 */
const TTL_MS=2*60*60*1000
const MAX_CHARACTERS=256*1024
// Timed FINALs can be larger than historical answer-only drafts. Keep the
// higher budget exclusive to same-tab Scale timing envelopes, still bounded.
const MAX_TIMED_CHARACTERS=1024*1024
const key=(publicId:string,attemptId:string)=>
  'huisurvey:v1:unfinished:'+publicId+':'+attemptId
export function clearLocalSurveyDraft(publicId:string,attemptId:string):void{
  try{sessionStorage.removeItem(key(publicId,attemptId))}catch{/* private mode */}
}
export type SurveyFinalSubmission={submissionId:string;screenOut:boolean;
  presentation?:{shownBlocks:string[]};cognitiveReferences?:SurveyCognitiveReference[];situationalReferences?:SurveySituationalReference[]}
export type SurveyLocalDraft<T>={answers:T;itemTimings?:Record<string,unknown>;
  finalSubmission?:SurveyFinalSubmission}
/** Keep a strict allowlist: the retry descriptor must never carry access credentials. */
const readFinalSubmission=(raw:unknown):SurveyFinalSubmission|null=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
  const final=raw as SurveyFinalSubmission
  if(typeof final.submissionId!=='string'||final.submissionId.length<16||final.submissionId.length>200||
    typeof final.screenOut!=='boolean'||final.presentation!==undefined&&(
      !final.presentation||typeof final.presentation!=='object'||Array.isArray(final.presentation)||
      !Array.isArray(final.presentation.shownBlocks)||final.presentation.shownBlocks.length>70||
      final.presentation.shownBlocks.some(key=>typeof key!=='string'||!/^[a-z][a-z0-9_-]{0,79}$/.test(key))))return null
  if(final.cognitiveReferences!==undefined&&(!Array.isArray(final.cognitiveReferences)||final.cognitiveReferences.length>70||final.cognitiveReferences.some(ref=>
    !ref||typeof ref.slotKey!=='string'||!Number.isSafeInteger(ref.epoch)||ref.epoch<1||typeof ref.resultId!=='string'||
    !/^[a-f0-9]{64}$/i.test(ref.resultHash)||!/^[a-f0-9]{64}$/i.test(ref.measurementDigest))))return null
  if(final.situationalReferences!==undefined&&(!Array.isArray(final.situationalReferences)||final.situationalReferences.length>30||!final.situationalReferences.every(isSurveySituationalReference)))return null
  return {submissionId:final.submissionId,screenOut:final.screenOut,
    ...(final.situationalReferences?{situationalReferences:final.situationalReferences.map(ref=>({protocol:ref.protocol,attemptId:ref.attemptId,submissionId:ref.submissionId,payloadHash:ref.payloadHash}))}:{}),
    ...(final.presentation?{presentation:{shownBlocks:[...final.presentation.shownBlocks]}}:{}),
    ...(final.cognitiveReferences?{cognitiveReferences:final.cognitiveReferences.map(ref=>({slotKey:ref.slotKey,epoch:ref.epoch,resultId:ref.resultId,resultHash:ref.resultHash,measurementDigest:ref.measurementDigest}))}:{})}
}
export function saveLocalSurveyDraft(publicId:string,attemptId:string,definitionDigest:string,
  answers:Record<string,unknown>,itemTimings?:Record<string,unknown>,
  finalSubmission?:SurveyFinalSubmission):boolean{
  try{
    const descriptor=finalSubmission===undefined?undefined:readFinalSubmission(finalSubmission)
    if(descriptor===null)return false
    let savedAt=Date.now()
    if(descriptor){
      const previous=sessionStorage.getItem(key(publicId,attemptId))
      if(previous){
        const prior=JSON.parse(previous) as {attemptId?:string;definitionDigest?:string;savedAt?:number;finalSubmission?:SurveyFinalSubmission}
        // Retrying/backgrounding a sealed request never renews its two-hour lifetime.
        if(prior.attemptId===attemptId&&prior.definitionDigest===definitionDigest&&
          prior.finalSubmission?.submissionId===descriptor.submissionId&&
          typeof prior.savedAt==='number'&&Number.isFinite(prior.savedAt)&&prior.savedAt<=savedAt)
          savedAt=prior.savedAt
      }
    }
    const payload=JSON.stringify({attemptId,definitionDigest,savedAt,answers,
      ...(itemTimings?{itemTimings}:{}),...(descriptor?{finalSubmission:descriptor}:{})})
    if(payload.length>(itemTimings?MAX_TIMED_CHARACTERS:MAX_CHARACTERS))
      return false
    sessionStorage.setItem(key(publicId,attemptId),payload)
    return true
  }catch{return false}
}
export function restoreLocalSurveyDraftEnvelope<T extends Record<string,unknown>>(
  publicId:string,attemptId:string,definitionDigest:string,
):SurveyLocalDraft<T>|null{
  try{
    const value=sessionStorage.getItem(key(publicId,attemptId))
    if(!value)return null
    if(value.length>MAX_TIMED_CHARACTERS){
      clearLocalSurveyDraft(publicId,attemptId);return null
    }
    const parsed=JSON.parse(value) as {attemptId?:string;definitionDigest?:string;
      savedAt?:number;answers?:unknown;itemTimings?:unknown;finalSubmission?:unknown}
    if((parsed.itemTimings===undefined&&value.length>MAX_CHARACTERS)||
      parsed.attemptId!==attemptId||parsed.definitionDigest!==definitionDigest||
      typeof parsed.savedAt!=='number'||!Number.isFinite(parsed.savedAt)||
      parsed.savedAt>Date.now()||Date.now()-parsed.savedAt>TTL_MS||
      !parsed.answers||typeof parsed.answers!=='object'||Array.isArray(parsed.answers)){
      clearLocalSurveyDraft(publicId,attemptId);return null
    }
    // Historical answer-only drafts remain readable, with missing timing
    // explicitly represented as recovered-unknown at final seal.
    const validTimings=parsed.itemTimings&&typeof parsed.itemTimings==='object'&&
      !Array.isArray(parsed.itemTimings)?parsed.itemTimings as Record<string,unknown>:undefined
    const final=parsed.finalSubmission===undefined?undefined:readFinalSubmission(parsed.finalSubmission)
    if(final===null){clearLocalSurveyDraft(publicId,attemptId);return null}
    return {answers:parsed.answers as T,
      ...(validTimings?{itemTimings:validTimings}:{}),...(final?{finalSubmission:final}:{})}
  }catch{clearLocalSurveyDraft(publicId,attemptId);return null}
}
export function restoreLocalSurveyDraft<T extends Record<string,unknown>>(
  publicId:string,attemptId:string,definitionDigest:string,
):T|null{
  return restoreLocalSurveyDraftEnvelope<T>(publicId,attemptId,definitionDigest)?.answers??null
}
