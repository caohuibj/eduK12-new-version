import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {createRelationalProductRegistry,type RelationalProductEntryV1} from '../assessment-relational/product-registry'
import type {ScaleDefinitionV2} from '../scale/scale-definition'
import {compileEducationApplicability,type EducationApplicabilityVariant} from './education-applicability'
import {educationLibraryProduct,fail} from './contracts'
import {validateResultDisclosureContract} from '../assessment-policy/result-disclosure'
import {assertSelfGroupOwnSummaryCeiling,assertSelfGroupV2Entry,buildSelfGroupCohortAnalysisPolicy,SELF_GROUP_POLICY_KEY} from '../assessment-policy/self-group-contract'

const hash=z.string().regex(/^[a-f0-9]{64}$/)
/** Persisted inside the registered resource entry; never a user-supplied grant. */
export const educationLibraryOriginSchema=z.object({
  schemaVersion:z.literal(1),adapterVersion:z.union([z.literal('1.0.0'),z.string().regex(/^2\.0\.\d+$/)]),
  entryId:z.string().guid(),product:educationLibraryProduct,releaseId:z.string().guid(),contentHash:hash,
  approvedSnapshotHash:hash,sourceDefinitionHash:hash,applicabilityHash:hash,variantKey:z.enum([
    'STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT','TEACHER:SELF','TEACHER:STUDENT_REPORT']),
  dependencies:z.array(z.object({releaseId:z.string().guid(),contentHash:hash}).strict()).max(20)
    .refine(values=>new Set(values.map(value=>value.releaseId)).size===values.length),
}).strict()
export type EducationLibraryOrigin=z.infer<typeof educationLibraryOriginSchema>
export type EducationLibraryResourceEntry=RelationalProductEntryV1&{libraryOrigin:EducationLibraryOrigin}
export const educationLibraryResourceKey=(origin:EducationLibraryOrigin)=>`library-scale:${origin.entryId}:${origin.product}:${origin.variantKey}${origin.adapterVersion==='1.0.0'?'':':GROUP'}`
export function educationLibraryResourceProduct(key:string){
  const match=/^library-scale:([a-f0-9-]{36}):(SCHOOL|TEACHER):(STUDENT:(?:SELF|PARENT_REPORT|TEACHER_REPORT)|TEACHER:(?:SELF|STUDENT_REPORT))(?::GROUP)?$/.exec(key)
  if(!match||!z.string().guid().safeParse(match[1]).success)fail('EDUCATION_LIBRARY_RESOURCE_KEY_INVALID')
  return match[2] as EducationLibraryOrigin['product']
}

/** Existing library approval supplies the content. PILOT is the existing
 * unqualified scientific baseline, NOT a claim that a pilot study was conducted.
 * This adapter neither adds an independent scientific reviewer nor grants any
 * person report-read permission. Disclosure below is only a content ceiling.
 */
export function educationLibraryResourceEntry(input:{origin:EducationLibraryOrigin;variant:EducationApplicabilityVariant;
  title:string;definition:ScaleDefinitionV2;compositeId:string;disclosure?:unknown}):EducationLibraryResourceEntry{
  const origin=educationLibraryOriginSchema.parse(input.origin),v=input.variant
  if(origin.adapterVersion!=='1.0.0'){
    if(v.responseMode!=='SELF')fail('EDUCATION_LIBRARY_GROUP_SELF_REQUIRED')
    const baseline=educationLibraryResourceEntry({...input,origin:{...origin,adapterVersion:'1.0.0'}})
    const disclosure=validateResultDisclosureContract(input.disclosure)
    assertSelfGroupOwnSummaryCeiling({approved:baseline.resultDisclosure!,proposed:disclosure})
    const keys=new Set(input.definition.scoring.scores.map(score=>score.key))
    if(disclosure.audiences.SUBJECT.mode!=='NONE'||Object.values(disclosure.audiences).some(rule=>rule.metricKeys.some(key=>!keys.has(key))))fail('EDUCATION_LIBRARY_GROUP_METRIC_CEILING')
    const entry:EducationLibraryResourceEntry={...baseline,libraryOrigin:origin,title:`${input.title}（群体汇总与原本人反馈）`,
      applicability:{...baseline.applicability,resourceKey:educationLibraryResourceKey(origin),resourceVersion:origin.adapterVersion,
        analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:SELF_GROUP_POLICY_KEY,minimumRespondents:disclosure.minimumRespondents},
      resultDisclosure:disclosure,cohortAnalysisPolicy:buildSelfGroupCohortAnalysisPolicy(disclosure)}
    assertSelfGroupV2Entry(entry);createRelationalProductRegistry([entry]);return entry
  }
  const [population,responseMode]=origin.variantKey.split(':')
  const expected=compileEducationApplicability({schemaVersion:1,administrations:[{population,responseMode}]}).variants[0]
  if(canonicalHash(v)!==canonicalHash(expected)||canonicalHash(input.definition)!==origin.sourceDefinitionHash)
    fail('EDUCATION_LIBRARY_RESOURCE_ORIGIN_MISMATCH')
  // Independent REFERENCE/REPORT dependency adapters are not implemented yet.
  // Never silently replace an actual dependency with an empty selection.
  if(origin.dependencies.length||input.definition.referencePolicy.type!=='none')
    fail('EDUCATION_LIBRARY_DEPENDENCY_ADAPTER_NOT_READY')
  const metricKeys=input.definition.scoring.scores.map(score=>score.key)
  const audience=input.definition.report.audienceContract?.audience
  const personal=v.responseMode==='SELF'&&((v.population==='STUDENT'&&audience==='student')
    ||(v.population==='TEACHER'&&audience==='teacher'))
  const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
  const self={mode:'INDIVIDUAL_SUMMARY' as const,metricKeys,longitudinalMetricKeys:input.definition.report.audienceContract?.longitudinalMetricKeys??[]}
  const policyKey='EDUCATION_LIBRARY_APPROVED_CONTENT_V1'
  // Observer consent is an existing collection prerequisite, not report access.
  // The independent result-disclosure ceiling below remains NONE for observers.
  const visibilityPolicyKey=v.responseMode!=='SELF'&&['PARENT','TEACHER'].includes(v.respondentRole)
    ?'observer_private_respondent_v1':policyKey
  const entry:EducationLibraryResourceEntry={
    libraryOrigin:origin,title:input.title,description:'共用量表库固定版本；适用方式来自该版本审批声明。科学基线不表示已完成试点研究。',
    releaseStatus:'PUBLISHED',scienceMaturity:'PILOT',
    initiationModes:v.responseMode==='SELF'?['ORG_ASSIGN','CLASS_ASSIGN']:['ORG_ASSIGN','RELATED_OBSERVER_ASSIGN'],
    subjectReportMode:'NONE',
    ...(v.population==='STUDENT'&&v.responseMode==='TEACHER_REPORT'?{allowedTargetModes:['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS'] as const}:{}),
    ...(v.population==='TEACHER'&&v.respondentRole==='STUDENT'?{allowedTargetModes:['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS','COURSE_TEACHER'] as const}:{}),
    applicability:{schemaVersion:1,resourceKind:'SCALE',resourceKey:educationLibraryResourceKey(origin),resourceVersion:origin.adapterVersion,
      subjectRoles:[v.subjectRole],respondentRoles:[v.respondentRole],relationshipKinds:[...v.relationshipKinds],perspectives:[v.perspective],
      analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey,minimumRespondents:null},
    cohortAnalysisPolicy:null,launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:input.compositeId},
    resultDisclosure:{schemaVersion:1,policyKey,minimumRespondents:null,audiences:{RESPONDENT:personal?self:none,
      SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}},
  }
  createRelationalProductRegistry([entry])
  return entry
}
