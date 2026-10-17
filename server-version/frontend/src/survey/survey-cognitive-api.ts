import type { CognitiveSessionApi } from '../modules/cognitive/api'
import type { CognitiveSession } from '../modules/cognitive/types'
import type { ApiResponse } from '../types'
export type SurveyCognitiveReference={slotKey:string;epoch:number;resultId:string;resultHash:string;measurementDigest:string}
export type SurveyCognitiveSession=CognitiveSession&{resultReference?:SurveyCognitiveReference;freshAdmission?:boolean;lockedPriorAnswers?:Record<string,Record<string,unknown>>}
export type SurveyCognitiveSessionInfo={slotKey:string;sessionId:string;status:string;epoch:number;resultReference?:SurveyCognitiveReference}
export type SurveyCredential={accessCredential:string;researchCode?:string}
export type SurveyCognitiveRequest=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export const surveyCognitivePath=(publicId:string,attemptId:string,slotKey:string)=>
  '/r/'+encodeURIComponent(publicId)+'/attempts/'+encodeURIComponent(attemptId)+'/cognitive/'+encodeURIComponent(slotKey)
/** Survey-only bearer transport. Never falls back to training/school cookies,
 * or sends trials through ordinary checkpoints. */
export function createSurveyCognitiveApi(request:SurveyCognitiveRequest,path:string,proof:SurveyCredential,
  onReference:(reference:SurveyCognitiveReference)=>void):CognitiveSessionApi{
  const wrap=<T,>(data:T):ApiResponse<T>=>({code:0,message:'成功',data})
  return {
    getSession:async id=>{
      const data=await request<SurveyCognitiveSession>(path+'/'+encodeURIComponent(id)+'/read','POST',proof)
      if(data.status==='COMPLETED'&&data.resultReference)onReference(data.resultReference)
      return wrap(data)
    },
    submitFinal:async(id,payload)=>{
      const result=await request<{completed:boolean;feedbackDeferred:boolean;resultReference?:SurveyCognitiveReference}>(
        path+'/'+encodeURIComponent(id)+'/final','POST',{...proof,...payload})
      if(result.completed&&result.resultReference)onReference(result.resultReference)
      return wrap(result)
    },
    appendTrial:async()=>{throw new Error('Survey 认知仅支持封存后一次性提交')},
    completeSession:async()=>{throw new Error('Survey 认知仅支持带绑定的 FINAL')},
  }
}
