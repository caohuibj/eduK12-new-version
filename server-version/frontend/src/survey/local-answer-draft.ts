/** Short-lived same-tab answer recovery. Never sends partial responses to the
 * server or persists them in localStorage; opening a new tab cannot read them.
 * The frozen definition and attempt ID fence stale/cross-wave data.
 */
const TTL_MS=2*60*60*1000
const MAX_CHARACTERS=256*1024
const key=(publicId:string,attemptId:string)=>
  'huisurvey:v1:unfinished:'+publicId+':'+attemptId
export function clearLocalSurveyDraft(publicId:string,attemptId:string):void{
  try{sessionStorage.removeItem(key(publicId,attemptId))}catch{/* private mode */}
}
export function saveLocalSurveyDraft(publicId:string,attemptId:string,definitionDigest:string,
  answers:Record<string,unknown>):boolean{
  try{
    const payload=JSON.stringify({attemptId,definitionDigest,savedAt:Date.now(),answers})
    if(payload.length>MAX_CHARACTERS)return false
    sessionStorage.setItem(key(publicId,attemptId),payload)
    return true
  }catch{return false}
}
export function restoreLocalSurveyDraft<T extends Record<string,unknown>>(
  publicId:string,attemptId:string,definitionDigest:string,
):T|null{
  try{
    const value=sessionStorage.getItem(key(publicId,attemptId))
    if(!value)return null
    if(value.length>MAX_CHARACTERS){clearLocalSurveyDraft(publicId,attemptId);return null}
    const parsed=JSON.parse(value) as {attemptId?:string;definitionDigest?:string;
      savedAt?:number;answers?:unknown}
    if(parsed.attemptId!==attemptId||parsed.definitionDigest!==definitionDigest||
      typeof parsed.savedAt!=='number'||!Number.isFinite(parsed.savedAt)||
      parsed.savedAt>Date.now()||Date.now()-parsed.savedAt>TTL_MS||
      !parsed.answers||typeof parsed.answers!=='object'||Array.isArray(parsed.answers)){
      clearLocalSurveyDraft(publicId,attemptId);return null
    }
    return parsed.answers as T
  }catch{clearLocalSurveyDraft(publicId,attemptId);return null}
}
