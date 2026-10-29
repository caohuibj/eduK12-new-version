import {canonicalHash} from '../assessment-runtime/canonical'
import {hashRelationalApplicability} from '../assessment-relational/contracts'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'
import {educationCompositionKey,type EducationCompositionOrigin,type EducationCompositionPolicyBinding} from '../education-tools/private-tool.composition-contracts'
import {teacherResourceMinimum} from './privacyV2'

export const STUDENT_COMPOSITION_POLICY='HUITEACHER_STUDENT_FEEDBACK_PROTECTED_V1'
export const isStudentComposition=(origin:EducationCompositionOrigin)=>origin.entry==='TEACHER'&&origin.variantKey==='TEACHER:STUDENT_REPORT'
export const isStudentCompositionKey=(key:string)=>/^education-composition:TEACHER:[0-9a-f-]{36}:TEACHER:STUDENT_REPORT:1\.0\.0$/.test(key)
/** An adult SELF report is not an observer report. Only declared observer
 * Teacher report scores can enter this separate protected group projection. */
export function studentCompositionSubjectCeiling(leaf:{audience:string|null;reportRespondent?:string|null;sourceProvider?:string;
 metricKeys:string[];reportScoreKeys?:string[]|null;subjectNumeric?:boolean|null}){
 const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
 if(leaf.audience!=='teacher'||leaf.reportRespondent!=='OBSERVER_REPORT'
  ||!['PRIVATE_VERSION','LIBRARY_SCALE','STANDARD_SCALE'].includes(leaf.sourceProvider??'')
  ||leaf.sourceProvider==='STANDARD_SCALE'&&leaf.subjectNumeric!==true)return none
 const keys=[...new Set(leaf.reportScoreKeys??[])].filter(key=>leaf.metricKeys.includes(key))
 return keys.length?{mode:'AGGREGATE_ONLY' as const,metricKeys:keys,longitudinalMetricKeys:[]}:none
}
/** Same protected group semantics as the existing student Form, with no
 * generic cross-tool cohort score or personal report entitlement. */
export function studentCompositionRunPolicy(input:{origin:EducationCompositionOrigin;binding:EducationCompositionPolicyBinding;compositeId:string}):RunResourcePolicy{
 if(!isStudentComposition(input.origin))throw Error('STUDENT_COMPOSITION_VARIANT_REQUIRED')
 const key=educationCompositionKey(input.origin),minimumRespondents=teacherResourceMinimum()
 const applicability={schemaVersion:1 as const,resourceKind:'BUNDLE' as const,resourceKey:key,resourceVersion:'1.0.0',
  subjectRoles:['TEACHER' as const],respondentRoles:['STUDENT' as const],relationshipKinds:['CLASS_TEACHER_STUDENT' as const],
  perspectives:['OBSERVER_REPORT' as const],analysisMode:'COHORT_AGGREGATE' as const,visibilityPolicyKey:STUDENT_COMPOSITION_POLICY,minimumRespondents}
 const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
 return {family:'BUNDLE',key,version:'1.0.0',scientificMaturity:'PILOT',applicabilityHash:hashRelationalApplicability(applicability),
  subjectRoles:applicability.subjectRoles,respondentRoles:applicability.respondentRoles,relationshipKinds:applicability.relationshipKinds,perspectives:applicability.perspectives,
  analysisMode:applicability.analysisMode,visibilityPolicyKey:STUDENT_COMPOSITION_POLICY,minimumRespondents,
  initiationModes:['ORG_ASSIGN'],allowedTargetModes:['SELECTED_CLASS_TEACHERS'],runtimeLaunchTarget:{kind:'COMPOSITE',ref:input.compositeId},educationComposition:input.binding,
  resultDisclosure:{schemaVersion:1,policyKey:STUDENT_COMPOSITION_POLICY,minimumRespondents,audiences:{
   RESPONDENT:{...none,mode:'COMPLETION_ONLY'},SUBJECT:{...none,mode:'AGGREGATE_ONLY'},ORGANIZATION:{...none,mode:'ORGANIZATION_AGGREGATE'},
   TEACHER:none,PARENT:none,PROFESSIONAL:none,RESEARCH:none}}}
}
/** Validate frozen semantics, never recompute a historic floor from today's
 * preference feature flags. The persisted track hash remains independent. */
export function validStudentCompositionPolicy(policy:RunResourcePolicy){
 const none={mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]},disclosure=policy.resultDisclosure
 return Boolean(policy.analysisMode==='COHORT_AGGREGATE'&&policy.visibilityPolicyKey===STUDENT_COMPOSITION_POLICY
  &&Number.isSafeInteger(policy.minimumRespondents)&&policy.minimumRespondents! >= 5
  &&canonicalHash(policy.allowedTargetModes??null)===canonicalHash(['SELECTED_CLASS_TEACHERS'])
  &&canonicalHash(policy.initiationModes??null)===canonicalHash(['ORG_ASSIGN'])
  &&disclosure?.policyKey===STUDENT_COMPOSITION_POLICY&&disclosure.minimumRespondents===policy.minimumRespondents
  &&canonicalHash(disclosure.audiences)===canonicalHash({RESPONDENT:{...none,mode:'COMPLETION_ONLY'},SUBJECT:{...none,mode:'AGGREGATE_ONLY'},
   ORGANIZATION:{...none,mode:'ORGANIZATION_AGGREGATE'},TEACHER:none,PARENT:none,PROFESSIONAL:none,RESEARCH:none})
  &&policy.educationComposition?.unitReports.every(unit=>unit.respondent.mode==='NONE')===true)
}
