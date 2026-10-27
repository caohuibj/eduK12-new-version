import type {PrivateToolApi} from './privateToolClient'
export type EducationAssessmentFamily='COGNITIVE'|'SITUATIONAL'|'BUNDLE'
export type EducationAssessmentLicense={resourceId:string;grantId:string}
export type EducationAssessmentPointer={releaseId:string;contentHash:string}
export type EducationAssessmentStatus='DRAFT'|'REVIEWED'|'PUBLISHED'|'RETIRED'
export type EducationAssessmentPreparation={resourceId:string;product:'SCHOOL'|'TEACHER';organizationId:string;family:EducationAssessmentFamily;
 sourceCompositeId:string;runtimeCompositeId:string;preparationHash:string;title:string;canPublish:false;
 units:Array<{itemId:string;family:'SCALE'|'COGNITIVE'|'SJT';measurement:EducationAssessmentPointer&{measurementHash:string}}>}
export type EducationAssessmentDisclosure={schemaVersion:1;policyKey:string;minimumRespondents:null;
 audiences:Record<'RESPONDENT'|'SUBJECT'|'TEACHER'|'PARENT'|'PROFESSIONAL'|'ORGANIZATION'|'RESEARCH',{
 mode:'NONE'|'COMPLETION_ONLY'|'INDIVIDUAL_SUMMARY';metricKeys:string[];longitudinalMetricKeys:[]}>}
export type EducationAssessmentRegistration={resourceId:string;resourceKey?:string;version?:'1.0.0';status:EducationAssessmentStatus;entryHash:string;entry?:unknown}
export type EducationAssessmentRegisterInput={expectedPreparationHash:string;disclosure:EducationAssessmentDisclosure;
 references:{schemaVersion:1;units:Array<{itemId:string;choices:Array<{releaseId:string;entryKey:string;priority:number}>}>};
 reports:Array<{itemId:string;releaseId:string}>;licenses:EducationAssessmentLicense[]}
/** Inject School/Teacher's existing authenticated product transport. The client
 * never reads session IDs or selects a Training/foreign-product cookie. */
export function educationAssessmentResourceClient(api:PrivateToolApi,organizationId:string){
 const base=`/organizations/${encodeURIComponent(organizationId)}/assessment-resource-registrations`
 const resource=(id:string)=>base+'/'+encodeURIComponent(id)
 return {
  list:(cursor?:string)=>api<{list:Array<{resourceId:string;family:EducationAssessmentFamily;title:string;status:EducationAssessmentStatus;entryHash:string}>;nextCursor:string|null}>(base+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  sources:()=>api<{list:Array<{sourceCompositeId:string;title:string;grantId:string;grantedResourceIds:string[];canPublish:false}>}>(base+'/source-candidates'),
  prepare:(input:{resourceId:string;sourceCompositeId:string;title:string;family:EducationAssessmentFamily;licenses:EducationAssessmentLicense[]})=>api<EducationAssessmentPreparation&{created:boolean}>(base+'/preparations','POST',input),
  preparation:(id:string)=>api<EducationAssessmentPreparation>(base+'/preparations/'+encodeURIComponent(id)),
  choices:(id:string)=>api<{emptySelectionAllowed:true;units:Array<{itemId:string;family:'SCALE'|'COGNITIVE'|'SJT';measurement:EducationAssessmentPointer;
   references:Array<EducationAssessmentPointer&{grantId:string;choices:Array<{entryKey:string;metricKey:string;referenceKind:string}>}>;
   reports:Array<EducationAssessmentPointer&{grantId:string;audience:string;title:string|null;metricKeys:string[]}>}>}>(base+'/preparations/'+encodeURIComponent(id)+'/content-choices'),
  register:(id:string,input:EducationAssessmentRegisterInput)=>api<EducationAssessmentRegistration>(base+'/preparations/'+encodeURIComponent(id)+'/register','POST',input),
  read:(id:string)=>api<EducationAssessmentRegistration>(resource(id)),
  transition:(id:string,action:'review'|'publish'|'retire',input:{expectedEntryHash:string;reason:string})=>api<EducationAssessmentRegistration>(resource(id)+'/'+action,'POST',input),
 }
}
