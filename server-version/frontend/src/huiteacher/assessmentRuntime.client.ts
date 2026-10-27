import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import type {ApiResponse} from '../types'
import type {CognitiveSessionApi} from '../modules/cognitive/api'
import type {CognitiveSession} from '../modules/cognitive/types'
import type {SituationalRunnerClient} from '../modules/situational/api'
import type {SituationalAttemptResponse} from '../modules/situational/types'
import {isCapabilitySources} from '../modules/assessment-media/video-capability-client'
import type {CompositeCurrentItem} from '../modules/composite/types'

export type TeacherAssessmentTask={
 executionId:string;organizationId:string;runId:string;eventId:string;eventTitle:string;title:string;
 family:'COGNITIVE'|'SITUATIONAL'|'BUNDLE';status:'ASSIGNED'|'STARTED'|'COMPLETED';runStatus:string;
 runtimeBindingRef:string|null;consentRequired:boolean;consentPurpose:string|null;consentVisibility:string|null
}
export type TeacherAssessmentCompletion={executionId:string;attemptId:string}
export const teacherAssessmentParentPath=(attemptId:string)=>'/assessment-composite-attempts/'+encodeURIComponent(attemptId)
const wrapped=<T,>(data:T):ApiResponse<T>=>({code:0,message:'成功',data})
const same=(actual:string,expected:string)=>{if(actual!==expected)throw new Error('测评子项与当前冻结任务不一致')}
async function blob(api:EducationReportApi,path:string){
 const data=await api<Blob>(path,'GET',undefined,{responseType:'blob'})
 if(!(data instanceof Blob))throw new Error('测评素材响应无效')
 return data
}
async function video(api:EducationReportApi,path:string,method='GET',payload?:unknown){
 const data=await api<unknown>(path,method,payload)
 if(!isCapabilitySources(data))throw new Error('测评视频授权响应无效')
 return data
}
/** All requests use the host's Teacher client (cookie, CSRF and invalid-session
 * handling included). No global Training client, token read or fetch fallback. */
export function createTeacherCognitiveClient(api:EducationReportApi,attemptId:string,itemId:string,sessionId:string):CognitiveSessionApi{
 const path=teacherAssessmentParentPath(attemptId)+'/items/'+encodeURIComponent(itemId)+'/cognitive/'+encodeURIComponent(sessionId)
 const location=(id:string)=>{same(id,sessionId);return path}
 return {
  getSession:async id=>wrapped(await api<CognitiveSession>(location(id))),
  submitFinal:async(id,payload)=>wrapped(await api<{completed:boolean;feedbackDeferred:boolean;replayed:boolean}>(location(id)+'/submit','POST',payload)),
  loadAsset:(id,assetId)=>blob(api,location(id)+'/assets/'+encodeURIComponent(assetId)+'/content'),
  issueVideoCapabilities:async(id,videoKey)=>wrapped(await video(api,location(id)+'/video-capabilities','POST',{videoKey})),
  appendTrial:async()=>{throw new Error('教师认知任务只支持一次性 FINAL 提交')},
  completeSession:async()=>{throw new Error('教师认知任务只支持一次性 FINAL 提交')},
 }
}
export function createTeacherSituationalClient(api:EducationReportApi,attemptId:string,itemId:string,childId:string):SituationalRunnerClient{
 const prefix=teacherAssessmentParentPath(attemptId)+'/items/'+encodeURIComponent(itemId)+'/situational/'+encodeURIComponent(childId)
 const path=(id:string)=>{same(id,childId);return prefix}
 const read=async(id:string)=>wrapped(await api<SituationalAttemptResponse>(path(id)))
 return {
  start:async()=>{throw new Error('教师情境任务必须由正式任务的冻结子项启动')},
  resume:read,result:read,
  submit:async(id,payload)=>wrapped(await api<SituationalAttemptResponse>(path(id)+'/submit','POST',payload)),
  loadAsset:(id,assetId)=>blob(api,path(id)+'/assets/'+encodeURIComponent(assetId)+'/content'),
  loadVideoSources:async(id,sceneKey)=>wrapped(await video(api,path(id)+'/scenes/'+encodeURIComponent(sceneKey)+'/video-sources')),
 }
}
function canonicalSegment(value:string){
 let decoded:string
 try{decoded=decodeURIComponent(value)}catch{throw new Error('测评素材路径无效')}
 if(!decoded||decoded==='.'||decoded==='..'||/[\\/?#%]/.test(decoded)||encodeURIComponent(decoded)!==value)throw new Error('测评素材路径无效')
}
/** Remap only the exact current Form/Scale unit emitted by the shared renderer.
 * Arbitrary Training URLs, foreign parents/items and traversal are rejected. */
export function createTeacherAssessmentMediaTransport(api:EducationReportApi,attemptId:string,item:CompositeCurrentItem){
 const parent='/api/composite-assessments/attempts/'+encodeURIComponent(attemptId)
 const unit=item.type==='SCALE'?'/items/'+encodeURIComponent(item.id)+'/scale/':item.type==='FORM_SECTION'
  ?'/form-sections/'+encodeURIComponent(item.formSectionId??item.id)+'/':null
 const location=(path:string,kind:'image'|'video')=>{
  if(!unit||!path.startsWith(parent+unit))throw new Error('素材不属于当前冻结测评单元')
  const suffix=path.slice((parent+unit).length)
  const match=(kind==='image'?/^assets\/([^/]+)\/content$/:item.type==='SCALE'
   ?/^items\/([^/]+)\/video-capability$/:/^items\/([^/]+)\/options\/(0|[1-9]\d*)\/video-capability$/).exec(suffix)
  if(!match)throw new Error('测评素材路径无效')
  canonicalSegment(match[1])
  return teacherAssessmentParentPath(attemptId)+unit+suffix
 }
 return {
  loadImage:async(path:string)=>blob(api,location(path,'image')),
  loadVideoCapability:async(path:string)=>video(api,location(path,'video'),'POST',{}),
 }
}
