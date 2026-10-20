import {sessionFetch} from './client'
export type FormalPopulation={kind:'SUPPORTED_MATCH';match:{minAgeMonthsInclusive?:number;maxAgeMonthsExclusive?:number;
  gradeLevels?:string[];primaryLanguages?:string[];countriesOrRegions?:string[];sexAtBirth?:Array<'female'|'male'|'intersex'>};basis:string}
  |{kind:'GENERAL_POPULATION';basis:string}
export type FormalReferenceSubmissionBody={sourceCandidateId:string;sourceCandidateHash:string;analyzeGrantId:string;
  statement:string;populationDescription:string;applicability:string;sampleAdequacy:string;uncertainty:string;consentUseAssessment:string;targetPopulation:FormalPopulation}
export type FormalReferenceCandidate={candidateId:string;candidateHash:string;analyzerId:string;sampleCount:number;sampleManifestHash:string;
  measurement:{releaseId:string;contentHash:string};
  definition:{entries:Array<{scoreKey:string;statistics:{mean?:number;sd?:number};limitations?:string[]}>};
  evidence:Record<string,string>;submissionStatement:string;consentUseAssessment:string;targetPopulation:FormalPopulation;
  consentEvidence:Array<{version:string;scopeHash:string;purpose:string;dataCategories:string[];body:string;bodyHash:string}>}
export type FormalReferenceGrant={grantId:string;measurementReleaseIds:string[];capabilities:Array<'reference.review'|'reference.publish'>}
export type FormalReferenceReviewBody={requestId:string;candidateId:string;candidateHash:string;grantId:string;
  decision:'APPROVED'|'REJECTED';statement:string;consentReviewed:true}
export type FormalReferencePublishBody={candidateId:string;candidateHash:string;grantId:string;reviewId:string;localKey:string;version:string}
export type FormalReferenceOperation={operation:'SUBMIT';body:FormalReferenceSubmissionBody}|{operation:'REVIEW';body:FormalReferenceReviewBody}|{operation:'PUBLISH';body:FormalReferencePublishBody}
export type FormalReferenceResult=FormalReferenceCandidate|{reviewId:string;candidateId:string;candidateHash:string;decision:string;reviewedAt:string}|
  {releaseId:string;contentHash:string;version:string;status:string}
export type SurveyReferenceRequest=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
const base='/api/training/reference-governance'
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await sessionFetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  let envelope:{code:number;message?:string;data?:T}
  try{envelope=await response.json()}catch{throw new Error('服务器响应无法核对，请保留完全相同的请求重试。')}
  if(!response.ok||envelope.code!==0)throw Object.assign(new Error(envelope.message||'正式参考操作未完成'),{status:response.status})
  if(envelope.data===undefined)throw new Error('服务器未返回可核对结果。')
  return envelope.data
}
export const formalReferenceApi={
  grants:()=>request<FormalReferenceGrant[]>('/capabilities'),
  read:(candidateId:string,grantId:string,purpose:'REVIEW'|'PUBLISH')=>request<FormalReferenceCandidate>('/read','POST',{candidateId,grantId,purpose}),
  execute:(operation:FormalReferenceOperation,product:'TRAINING'|'SURVEY'='TRAINING',surveyRequest?:SurveyReferenceRequest):Promise<FormalReferenceResult>=>{
    if(product==='SURVEY'){
      if(operation.operation!=='SUBMIT'||!surveyRequest)return Promise.reject(new Error('Survey 只支持来源提交，并须使用当前 Survey 会话。'))
      return surveyRequest('/reference-governance/submissions','POST',operation.body)
    }
    return request(operation.operation==='SUBMIT'?'/submissions':operation.operation==='REVIEW'?'/reviews':'/publish','POST',operation.body)
  },
}
