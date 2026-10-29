import type {EducationPackageRef} from './packageReferenceClient'
import type {PrivateToolApi} from './privateToolClient'
export type EducationAssessmentFamily='COGNITIVE'|'SITUATIONAL'|'BUNDLE'
export type EducationAssessmentLicense={resourceId:string;grantId:string}
export type EducationAssessmentPointer={releaseId:string;contentHash:string}
export type EducationAssessmentStatus='DRAFT'|'REVIEWED'|'PUBLISHED'|'RETIRED'
export type EducationAssessmentPreparation={resourceId:string;product:'SCHOOL'|'TEACHER';organizationId:string;family:EducationAssessmentFamily;
 sourceCompositeId:string;runtimeCompositeId:string;preparationHash:string;title:string;canPublish:false;licenses:EducationAssessmentLicense[];
 units:Array<{itemId:string;family:'SCALE'|'COGNITIVE'|'SJT';measurement:EducationAssessmentPointer&{measurementHash:string}}>;
 publicPackage?:EducationPackageRef;fixedSelection?:Pick<EducationAssessmentRegisterInput,'references'|'reports'>}
export type EducationAssessmentDisclosure={schemaVersion:1;policyKey:string;minimumRespondents:null;
 audiences:Record<'RESPONDENT'|'SUBJECT'|'TEACHER'|'PARENT'|'PROFESSIONAL'|'ORGANIZATION'|'RESEARCH',{
 mode:'NONE'|'COMPLETION_ONLY'|'INDIVIDUAL_SUMMARY';metricKeys:string[];longitudinalMetricKeys:[]}>}
export type EducationFeedbackPolicy={schemaVersion:1;mode:'IMMEDIATE'}|{schemaVersion:1;mode:'SCHEDULED';releaseAt:string}
export type EducationAssessmentRegistration={resourceId:string;resourceKey?:string;version?:'1.0.0';status:EducationAssessmentStatus;entryHash:string;entry?:unknown;createdBy?:string;reviewedBy?:string|null}
export type EducationAssessmentRegisterInput={expectedPreparationHash:string;disclosure:EducationAssessmentDisclosure;feedbackPolicy:EducationFeedbackPolicy;
 references:{schemaVersion:1;units:Array<{itemId:string;choices:Array<{releaseId:string;entryKey:string;priority:number}>}>};
 reports:Array<{itemId:string;releaseId:string}>;licenses:EducationAssessmentLicense[]}
/** Inject School/Teacher's existing authenticated product transport. The client
 * never reads session IDs or selects a Training/foreign-product cookie. */
export function educationAssessmentResourceClient(api:PrivateToolApi,organizationId:string){
 const base=`/organizations/${encodeURIComponent(organizationId)}/assessment-resource-registrations`
 const resource=(id:string)=>base+'/'+encodeURIComponent(id)
 return {
  list:(cursor?:string)=>api<{list:Array<{resourceId:string;family:EducationAssessmentFamily;title:string;status:EducationAssessmentStatus;entryHash:string}>;nextCursor:string|null}>(base+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  sources:(cursor?:string,publicPackage?:EducationPackageRef)=>api<{nextCursor:string|null;list:Array<{sourceCompositeId:string;title:string;canPrepare:boolean;unavailableReason:null|'SOURCE_NOT_AVAILABLE'|'MISSING_DISTRIBUTION_AUTHORITY';licenses:EducationAssessmentLicense[];canPublish:false}>}>(base+'/source-candidates'+(cursor||publicPackage?'?'+new URLSearchParams({...cursor?{cursor}:{},...publicPackage?{publicPackage:JSON.stringify(publicPackage)}:{}}):'')),
  prepare:(input:{resourceId:string;sourceCompositeId:string;title:string;family:EducationAssessmentFamily;licenses:EducationAssessmentLicense[];publicPackage?:EducationPackageRef})=>api<EducationAssessmentPreparation&{created:boolean}>(base+'/preparations','POST',input),
  preparation:(id:string)=>api<EducationAssessmentPreparation>(base+'/preparations/'+encodeURIComponent(id)),
  choices:(id:string,cursor?:string)=>api<{nextCursor:string|null;emptySelectionAllowed:true;units:Array<{itemId:string;family:'SCALE'|'COGNITIVE'|'SJT';measurement:EducationAssessmentPointer;
   references:Array<EducationAssessmentPointer&{selectable:boolean;unavailableReason:null|'CONTENT_NOT_AVAILABLE'|'MISSING_DISTRIBUTION_AUTHORITY';licenses:EducationAssessmentLicense[];choices:Array<{entryKey:string;metricKey:string;referenceKind:string}>}>;
   reports:Array<EducationAssessmentPointer&{selectable:boolean;unavailableReason:null|'CONTENT_NOT_AVAILABLE'|'MISSING_DISTRIBUTION_AUTHORITY';licenses:EducationAssessmentLicense[];audience:string;title:string|null;metricKeys:string[]}>}>}>(base+'/preparations/'+encodeURIComponent(id)+'/content-choices'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  register:(id:string,input:EducationAssessmentRegisterInput)=>api<EducationAssessmentRegistration>(base+'/preparations/'+encodeURIComponent(id)+'/register','POST',input),
  read:(id:string)=>api<EducationAssessmentRegistration>(resource(id)),
  transition:(id:string,action:'review'|'publish'|'retire',input:{expectedEntryHash:string;reason:string})=>api<EducationAssessmentRegistration>(resource(id)+'/'+action,'POST',input),
 }
}

/** Keep the preparation's original grants; never replace overlapping authority. */
export function mergeEducationAssessmentLicenses(...groups:EducationAssessmentLicense[][]):EducationAssessmentLicense[]{
 const exact=new Map<string,string>()
 for(const group of groups){
  if(!Array.isArray(group))throw Error('服务器尚未返回精确许可，请重新读取。')
  for(const license of group){
   if(!license||!license.resourceId||!license.grantId)throw Error('精确许可不完整，请重新读取。')
   const prior=exact.get(license.resourceId)
   if(prior&&prior!==license.grantId)throw Error('同一资源出现不同授权证明，已停止提交；请核对原准备许可与所选内容。')
   exact.set(license.resourceId,license.grantId)
  }
 }
 return [...exact].sort(([a],[b])=>a.localeCompare(b)).map(([resourceId,grantId])=>({resourceId,grantId}))
}

export type EducationAssessmentChoices=Awaited<ReturnType<ReturnType<typeof educationAssessmentResourceClient>['choices']>>
/** Pagination never replaces the grants or C/P/R pointers already selected. */
export function appendEducationAssessmentChoices(previous:EducationAssessmentChoices,next:EducationAssessmentChoices):EducationAssessmentChoices{
 if(previous.units.length!==next.units.length||new Set(next.units.map(unit=>unit.itemId)).size!==next.units.length)
  throw Error('分页中的固定测量单元发生变化，请重新读取准备内容。')
 const append=<T extends {releaseId:string}>(old:T[],page:T[])=>{
  const seen=new Set(old.map(row=>row.releaseId));return [...old,...page.filter(row=>{if(seen.has(row.releaseId))return false;seen.add(row.releaseId);return true})]
 }
 return {...next,units:previous.units.map(unit=>{
  const incoming=next.units.find(row=>row.itemId===unit.itemId)
  if(!incoming||incoming.family!==unit.family||incoming.measurement.releaseId!==unit.measurement.releaseId||incoming.measurement.contentHash!==unit.measurement.contentHash)
   throw Error('分页中的固定内容版本发生变化，请重新读取准备内容。')
  return {...unit,references:append(unit.references,incoming.references),reports:append(unit.reports,incoming.reports)}
 })}
}
