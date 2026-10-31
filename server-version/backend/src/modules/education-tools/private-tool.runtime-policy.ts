import {createRelationalProductRegistry,type RelationalProductEntryV1} from '../assessment-relational/product-registry'
import type {ScaleDefinitionV2} from '../scale/scale-definition'
import {privateScaleResourceKey,privateScaleVariant,type PrivateScaleRuntimeOrigin} from './private-tool.runtime-origin'
import {assertSelfGroupV2Entry,buildSelfGroupCohortAnalysisPolicy,SELF_GROUP_POLICY_KEY} from '../assessment-policy/self-group-contract'
import {schoolPrivateGroupDisclosure,schoolPrivateScaleGroupChoice} from './school-private-group-source'
import {parseSchoolPrivateGroupSelection} from './school-private-group-selection'
export function privateScaleResourceEntry(origin:PrivateScaleRuntimeOrigin,title:string,definition:ScaleDefinitionV2,compositeId:string){
 const [population,responseMode]=origin.variantKey.split(':')
 const v=privateScaleVariant(origin.entry,{population,responseMode})
 const metricKeys=definition.scoring.scores.map(score=>score.key)
 const personal=v.responseMode==='SELF'&&definition.report.audienceContract?.audience===(v.population==='STUDENT'?'student':'teacher')
 const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
 const policyKey='EDUCATION_PRIVATE_TOOL_V1'
 const entry:RelationalProductEntryV1&{privateOrigin:PrivateScaleRuntimeOrigin}={
  privateOrigin:origin,title,description:'作者私有固定版本；不是公库发布或科学审查结论。',releaseStatus:'PUBLISHED',scienceMaturity:'PILOT',
  initiationModes:v.responseMode==='SELF'?['ORG_ASSIGN','CLASS_ASSIGN']:['ORG_ASSIGN','RELATED_OBSERVER_ASSIGN'],subjectReportMode:'NONE',
  applicability:{schemaVersion:1,resourceKind:'SCALE',resourceKey:privateScaleResourceKey(origin),resourceVersion:origin.adapterVersion,
   subjectRoles:[v.subjectRole],respondentRoles:[v.respondentRole],relationshipKinds:[...v.relationshipKinds],perspectives:[v.perspective],
   analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:v.responseMode==='SELF'?policyKey:'observer_private_respondent_v1',minimumRespondents:null},
  ...(v.population==='STUDENT'&&v.responseMode==='TEACHER_REPORT'?{allowedTargetModes:['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS'] as const}:{}),
  cohortAnalysisPolicy:null,launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:compositeId},
  resultDisclosure:{schemaVersion:1,policyKey,minimumRespondents:null,audiences:{RESPONDENT:personal?{mode:'INDIVIDUAL_SUMMARY',metricKeys,longitudinalMetricKeys:definition.report.audienceContract?.longitudinalMetricKeys??[]}:none,
   SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}},
 }
 if(origin.schemaVersion===2){
  const ceiling=schoolPrivateScaleGroupChoice({id:origin.versionId,contentHash:origin.contentHash,title,entry:origin.entry},definition)
  const selection=parseSchoolPrivateGroupSelection(origin.groupReporting,{entry:origin.entry,administration:{population,responseMode},sources:ceiling?[ceiling]:[]})
  entry.resultDisclosure=schoolPrivateGroupDisclosure({approved:entry.resultDisclosure!,minimumRespondents:selection.minimumRespondents,audiences:selection.leaves[0].audiences})
  entry.applicability={...entry.applicability,analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:SELF_GROUP_POLICY_KEY,minimumRespondents:selection.minimumRespondents}
  entry.cohortAnalysisPolicy=buildSelfGroupCohortAnalysisPolicy(entry.resultDisclosure)
  assertSelfGroupV2Entry(entry)
 }
 createRelationalProductRegistry([entry]);return entry
}
