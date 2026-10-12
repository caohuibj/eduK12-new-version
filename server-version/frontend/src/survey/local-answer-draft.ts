/** Short-lived same-tab Survey draft. Never persists in localStorage or
 * sends data during item navigation. Source+Attempt fence stale submissions.
 */
const TTL_MS=2*60*60*1000
const MAX_CHARACTERS=256*1024
const key=(publicId:string,attemptId:string)=>
  'huisurvey:v1:unfinished:'+publicId+':'+attemptId
export function clearLocalSurveyDraft(publicId:string,attemptId:string):void{
  try{sessionStorage.removeItem(key(publicId,attemptId))}catch{/* private mode */}
}
export type SurveyLocalDraft<T>={answers:T;itemTimings?:Record<string,unknown>}
export function saveLocalSurveyDraft(publicId:string,attemptId:string,definitionDigest:string,
  answers:Record<string,unknown>,itemTimings?:Record<string,unknown>):boolean{
  try{
    const payload=JSON.stringify({attemptId,definitionDigest,savedAt:Date.now(),answers,
      ...(itemTimings?{itemTimings}:{})})
    if(payload.length>MAX_CHARACTERS)return false
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
    if(value.length>MAX_CHARACTERS){clearLocalSurveyDraft(publicId,attemptId);return null}
    const parsed=JSON.parse(value) as {attemptId?:string;definitionDigest?:string;
      savedAt?:number;answers?:unknown;itemTimings?:unknown}
    if(parsed.attemptId!==attemptId||parsed.definitionDigest!==definitionDigest||
      typeof parsed.savedAt!=='number'||!Number.isFinite(parsed.savedAt)||
      parsed.savedAt>Date.now()||Date.now()-parsed.savedAt>TTL_MS||
      !parsed.answers||typeof parsed.answers!=='object'||Array.isArray(parsed.answers)){
      clearLocalSurveyDraft(publicId,attemptId);return null
    }
    // Historical answer-only drafts remain readable, with missing timing
    // explicitly represented as recovered-unknown at final seal.
    const validTimings=parsed.itemTimings&&typeof parsed.itemTimings==='object'&&
      !Array.isArray(parsed.itemTimings)?parsed.itemTimings as Record<string,unknown>:undefined
    return {answers:parsed.answers as T,
      ...(validTimings?{itemTimings:validTimings}:{})}
  }catch{clearLocalSurveyDraft(publicId,attemptId);return null}
}
export function restoreLocalSurveyDraft<T extends Record<string,unknown>>(
  publicId:string,attemptId:string,definitionDigest:string,
):T|null{
  return restoreLocalSurveyDraftEnvelope<T>(publicId,attemptId,definitionDigest)?.answers??null
}
