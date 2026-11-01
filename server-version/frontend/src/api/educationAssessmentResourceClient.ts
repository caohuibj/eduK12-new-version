import {
 assertEducationAssessmentDirectory,type EducationAssessmentDirectory,type EducationAssessmentProduct,
 type EducationAssessmentResourceAdapter,type EducationAssessmentScope,
} from './educationAssessmentResources'

type EducationApi=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Uses only the injected product's existing same-origin authenticated client.
 * actorKey is local lifecycle state and never sent as caller identity.
 */
export function createEducationAssessmentResourceAdapter(api:EducationApi,product:EducationAssessmentProduct):EducationAssessmentResourceAdapter{
 const paths=(scope:EducationAssessmentScope)=>{
  if(!['SCHOOL','TEACHER'].includes(product)||scope.product!==product||![scope.organizationId,scope.workflowId,scope.runId].every(value=>uuid.test(value))
   ||!Number.isSafeInteger(scope.expectedVersion)||scope.expectedVersion<1)throw Error('学校、入口或任务版本无效，请重新读取任务配置。')
  const org='/organizations/'+encodeURIComponent(scope.organizationId)
  const run=product==='TEACHER'?org+'/evaluation-events/'+encodeURIComponent(scope.workflowId)+'/run'
   :org+'/activities/'+encodeURIComponent(scope.workflowId)+'/runs/'+encodeURIComponent(scope.runId)
  return {directory:run+'/assessment-resources',tracks:run+'/tracks'}
 }
 return {
  async list(scope,cursor,filters={}){
   const path=paths(scope),query=new URLSearchParams({...(product==='TEACHER'?{runId:scope.runId}:{}),expectedVersion:String(scope.expectedVersion)})
   if(cursor){if(!uuid.test(cursor))throw Error('目录分页位置无效，请重新读取目录。');query.set('cursor',cursor)}
   if(filters.keyword?.trim())query.set('keyword',filters.keyword.trim())
   if(filters.tags?.length)query.set('tags',filters.tags.join(','))
   const data=await api<EducationAssessmentDirectory>(path.directory+'?'+query)
   assertEducationAssessmentDirectory(data,scope)
   return data
  },
  async addTrack(scope,input){
   const path=paths(scope),prefix=`education-assessment:${product}:${scope.organizationId}:`
   if(input.expectedVersion!==scope.expectedVersion||input.expectedRunId!==scope.runId||!['COGNITIVE','SITUATIONAL','BUNDLE'].includes(input.resource.family)
    ||!input.resource.key.startsWith(prefix)||!uuid.test(input.resource.key.slice(prefix.length))||input.resource.version!=='1.0.0')
    throw Error('固定资源或任务版本已变化，请重新读取目录。')
   const policy=input.requestedPolicy
   // Do not forward any directory status, actorKey, session or approval fields.
   await api(path.tracks,'POST',{expectedVersion:input.expectedVersion,expectedRunId:scope.runId,
    resource:{family:input.resource.family,key:input.resource.key,version:input.resource.version},
    subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},
    requestedPolicy:{subjectRoles:[...policy.subjectRoles],respondentRoles:[...policy.respondentRoles],relationshipKinds:[...policy.relationshipKinds],
     perspectives:[...policy.perspectives],analysisMode:policy.analysisMode,visibilityPolicyKey:policy.visibilityPolicyKey,minimumRespondents:policy.minimumRespondents,
     ...(policy.targetPolicy?{targetPolicy:{mode:policy.targetPolicy.mode}}:{})}})
  },
 }
}
