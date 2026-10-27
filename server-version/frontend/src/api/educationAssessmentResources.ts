import type {RunRequestedPolicy} from './runs'

export type EducationAssessmentProduct='SCHOOL'|'TEACHER'
export type EducationAssessmentFamily='COGNITIVE'|'SITUATIONAL'|'BUNDLE'
export type EducationAssessmentScope={
  product:EducationAssessmentProduct;organizationId:string;actorKey:string
  workflowId:string;runId:string;expectedVersion:number
}
type ReleasePointer={releaseId:string;contentHash:string}
export type EducationAssessmentUnit={
  itemId:string;family:'SCALE'|'COGNITIVE'|'SJT'
  measurement:ReleasePointer&{measurementHash:string}
  references:ReleasePointer[];report:ReleasePointer|null
}
/** Projection of a server-authorized directory row, never an identity reader.
 * availability must be computed by current organization/source/license checks.
 * These fields control presentation; addTrack must independently recheck them.
 */
export type EducationAssessmentResource={
  title:string;family:EducationAssessmentFamily;key:string;version:'1.0.0'
  product:EducationAssessmentProduct;organizationId:string
  releaseStatus:'DRAFT'|'PUBLISHED'|'HOLD'|'DEPRECATED'|'ARCHIVED'
  availability:'AVAILABLE'|'UNAUTHORIZED'|'INCOMPATIBLE'|'LICENSE_REQUIRED'|'HOLD'
  educationOriginHash:string;units:EducationAssessmentUnit[]
  requestedPolicy:RunRequestedPolicy
}
export type EducationAssessmentDirectory={
  scope:Omit<EducationAssessmentScope,'actorKey'>
  list:EducationAssessmentResource[];nextCursor:string|null
}
export type EducationAssessmentTrackInput={
  expectedVersion:number
  resource:Pick<EducationAssessmentResource,'family'|'key'|'version'>
  subjectSelector:{kind:'ALL_CURRENT'};respondentSelector:{kind:'ALL_CURRENT'}
  requestedPolicy:RunRequestedPolicy
}
/** Product adapters own real URLs and response mapping. No Training transport,
 * session id or browser capability flag can substitute for this service.
 */
export interface EducationAssessmentResourceAdapter{
  list(scope:EducationAssessmentScope,cursor?:string):Promise<EducationAssessmentDirectory>
  addTrack(scope:EducationAssessmentScope,input:EducationAssessmentTrackInput):Promise<void>
}

export const educationAssessmentScopeKey=(scope:EducationAssessmentScope)=>JSON.stringify([
  scope.product,scope.organizationId,scope.actorKey,scope.workflowId,scope.runId,scope.expectedVersion,
])
export const educationAssessmentResourceId=(row:EducationAssessmentResource)=>JSON.stringify([row.family,row.key,row.version,row.educationOriginHash])
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const digest=/^[0-9a-f]{64}$/
const pointer=(value:ReleasePointer)=>Boolean(value&&uuid.test(value.releaseId)&&digest.test(value.contentHash))
const only=(values:string[],value:string)=>Array.isArray(values)&&values.length===1&&values[0]===value

export function selectableEducationAssessmentResource(row:EducationAssessmentResource,scope:EducationAssessmentScope):boolean{
  if(!row||'identityOnly' in row||!['SCHOOL','TEACHER'].includes(scope.product)||!uuid.test(scope.organizationId))return false
  const prefix=`education-assessment:${scope.product}:${scope.organizationId}:`
  const role=scope.product==='TEACHER'?'TEACHER':'STUDENT',policy=row.requestedPolicy
  if(row.product!==scope.product||row.organizationId!==scope.organizationId||!['COGNITIVE','SITUATIONAL','BUNDLE'].includes(row.family)
    ||typeof row.key!=='string'||!row.key.startsWith(prefix)||!uuid.test(row.key.slice(prefix.length))||row.version!=='1.0.0'
    ||!row.title?.trim()||row.releaseStatus!=='PUBLISHED'||row.availability!=='AVAILABLE'||!digest.test(row.educationOriginHash)
    ||!policy||!only(policy.subjectRoles,role)||!only(policy.respondentRoles,role)||!only(policy.relationshipKinds,'SELF')
    ||!only(policy.perspectives,'SELF_REPORT')||policy.analysisMode!=='INDIVIDUAL_ONLY'||policy.minimumRespondents!==null
    ||!policy.visibilityPolicyKey?.trim()||(policy.targetPolicy&&policy.targetPolicy.mode!=='SELF'))return false
  if(!Array.isArray(row.units)||!row.units.length||row.units.length>1000)return false
  if(row.family!=='BUNDLE'&&(row.units.length!==1||row.units[0]?.family!==(row.family==='SITUATIONAL'?'SJT':'COGNITIVE')))return false
  const items=new Set<string>(),releases=new Map<string,{hash:string;layer:string}>()
  for(const unit of row.units){
    if(!unit||!uuid.test(unit.itemId)||items.has(unit.itemId)||!['SCALE','COGNITIVE','SJT'].includes(unit.family)
      ||!pointer(unit.measurement)||!digest.test(unit.measurement.measurementHash)||!Array.isArray(unit.references)
      ||unit.references.length>100||unit.references.some(ref=>!pointer(ref))||new Set(unit.references.map(ref=>ref.releaseId)).size!==unit.references.length
      ||(unit.report!==null&&!pointer(unit.report)))return false
    items.add(unit.itemId)
    for(const [layer,ref] of [['MEASUREMENT',unit.measurement],...unit.references.map(ref=>['REFERENCE',ref] as const),...(unit.report?[['REPORT',unit.report] as const]:[])] as const){
      const previous=releases.get(ref.releaseId)
      if(previous&&(previous.hash!==ref.contentHash||previous.layer!==layer))return false
      releases.set(ref.releaseId,{hash:ref.contentHash,layer})
    }
  }
  return true
}

export function assertEducationAssessmentDirectory(data:EducationAssessmentDirectory,scope:EducationAssessmentScope):void{
  const received=data?.scope
  if(!received||received.product!==scope.product||received.organizationId!==scope.organizationId
    ||received.workflowId!==scope.workflowId||received.runId!==scope.runId||received.expectedVersion!==scope.expectedVersion
    ||!Array.isArray(data.list)||(data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!data.nextCursor.trim())))
    throw Error('授权目录与当前学校、活动或任务版本不一致，请重新读取任务配置。')
}

export function educationAssessmentTrackInput(scope:EducationAssessmentScope,row:EducationAssessmentResource):EducationAssessmentTrackInput{
  if(!selectableEducationAssessmentResource(row,scope)||!scope.actorKey||!scope.workflowId||!scope.runId
    ||!Number.isSafeInteger(scope.expectedVersion)||scope.expectedVersion<1)throw Error('资源资格或任务版本已变化，请重新读取授权目录。')
  const policy=row.requestedPolicy
  return {expectedVersion:scope.expectedVersion,resource:{family:row.family,key:row.key,version:row.version},
    subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},requestedPolicy:{
      subjectRoles:[...policy.subjectRoles],respondentRoles:[...policy.respondentRoles],
      relationshipKinds:[...policy.relationshipKinds],perspectives:[...policy.perspectives],
      analysisMode:policy.analysisMode,visibilityPolicyKey:policy.visibilityPolicyKey,minimumRespondents:null,
      ...(policy.targetPolicy?{targetPolicy:{mode:'SELF'}}:{}),
    }}
}
