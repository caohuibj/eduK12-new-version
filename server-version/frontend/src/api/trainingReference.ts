import {sessionFetch} from './client'
export type TrainingReferenceSelector={itemId:string;scoreKey:string;publication:string;configDigest:string|null;variantKey:string|null;materialGroupKey?:string}
export const trainingReferenceEvidenceLabels={methodRationale:'方法依据',inclusionRule:'纳入规则',missingness:'缺失处理',repeatResponses:'重复作答',organizationClustering:'组织聚类',administrationDifferences:'施测差异',uncertainty:'不确定性',applicability:'适用范围',sampleAdequacy:'样本充分性'} as const
export type TrainingReferenceEvidence=Record<keyof typeof trainingReferenceEvidenceLabels,string>
export type TrainingReferenceCandidate={candidateId:string;candidateHash:string;sampleSize:number;measurement:{releaseId:string;contentHash:string};
 definition:{referenceVersion:string;entries:Array<{scoreKey:string;referenceKind:string;statistics:{mean?:number;sd?:number};limitations?:string[]}>};
 evidence:Record<string,string>;source:{courseId:string;compositeId:string;selector:TrainingReferenceSelector;cutOff:string;sourceHash:string;sourceCount:number};exclusionCounts?:Record<string,number>}
export type TrainingReferenceCreate={requestId:string;selector:TrainingReferenceSelector;referenceVersion:string;evidence:TrainingReferenceEvidence}
export type TrainingReferenceReview={requestId:string;candidateId:string;candidateHash:string;decision:'APPROVED'|'REJECTED';statement:string}
export type TrainingReferencePublish={requestId:string;candidateId:string;reviewId:string;localKey:string;version:string}
export type TrainingReferenceContext={courseId:string;compositeId:string;grantId:string}
export type TrainingReferenceOperation={operation:'CREATE';body:TrainingReferenceCreate}|{operation:'REVIEW';body:TrainingReferenceReview}|{operation:'PUBLISH';body:TrainingReferencePublish}
export type TrainingReferenceResult=TrainingReferenceCandidate|{reviewId:string}|{releaseId:string;contentHash:string;version:string;status:string}
const base=(context:TrainingReferenceContext)=>'/api/questionnaire-products/'+encodeURIComponent(context.compositeId)+'/reference-candidates/courses/'+encodeURIComponent(context.courseId)
async function request<T>(context:TrainingReferenceContext,path:string,method:string,body?:unknown):Promise<T>{
 const response=await sessionFetch(base(context)+path+'?grantId='+encodeURIComponent(context.grantId),{method,
  headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
 let envelope:{code:number;message?:string;data?:T}
 try{envelope=await response.json()}catch{throw new Error('服务器响应无法核对，请保留原请求并查询状态。')}
 if(!response.ok||envelope.code!==0)throw Object.assign(new Error(envelope.message||'参考操作未完成'),{status:response.status})
 if(envelope.data===undefined)throw new Error('服务器未返回可核对的操作结果。')
 return envelope.data
}
export const trainingReferenceApi={
 read:(context:TrainingReferenceContext,candidateId:string)=>request<TrainingReferenceCandidate>(context,'/'+encodeURIComponent(candidateId),'GET'),
 execute:(context:TrainingReferenceContext,operation:TrainingReferenceOperation):Promise<TrainingReferenceResult>=>{
  if(operation.operation==='CREATE')return request(context,'/','POST',operation.body)
  const {candidateId,...body}=operation.body
  return request(context,'/'+encodeURIComponent(candidateId)+(operation.operation==='REVIEW'?'/review':'/publish'),'POST',body)
 },
 status:(context:TrainingReferenceContext,operation:TrainingReferenceOperation)=>request<{status:'MISSING'|'COMPLETED';requestId:string;result?:TrainingReferenceResult}>(context,
  '/request-status/'+operation.operation,'POST',operation.body),
}
