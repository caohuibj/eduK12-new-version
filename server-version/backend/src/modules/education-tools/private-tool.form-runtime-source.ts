import {privateToolImageReferences} from './private-tool.media-definition'
import {assertAssessmentAssetReferencesReady} from '../assessment-media/assessment-asset'
import type {Prisma} from '@prisma/client'
import {createRelationalProductRegistry,type RelationalProductEntryV1} from '../assessment-relational/product-registry'
import {privateToolContentHash} from './private-tool.definition'
import {privateToolFail} from './private-tool.contracts'
import {compilePrivateFormRuntime} from './private-tool.form-runtime-adapter'
import {privateFormResourceKey,privateFormVariant,type PrivateFormOrigin} from './private-tool.form-runtime-contracts'
/** Identity, not task, raw-answer, or report permission. */
export async function readPrivateFormVersionIdentity(tx:Prisma.TransactionClient,versionId:string){
 const version=await tx.educationPrivateToolVersion.findUnique({where:{id:versionId}})
 if(!version||version.kind!=='FORM'||!['SCHOOL','TEACHER'].includes(version.entry)
  ||version.contentHash!==privateToolContentHash('FORM',version.title,version.definition))privateToolFail('PRIVATE_FORM_RUNTIME_SOURCE_INVALID')
 const compiled=compilePrivateFormRuntime(version.definition),refs=privateToolImageReferences('FORM',compiled.definition)
 if(refs.all.length){
  const rows=await tx.storedAsset.findMany({where:{id:{in:refs.all.map(ref=>ref.assetId)},ownerId:version.ownerUserId,
   accessScope:'PRIVATE',scopeId:{startsWith:`education-private:${version.entry}:${version.organizationId}:`},deletedAt:null,
   references:{some:{entityType:'EducationPrivateToolVersion',entityId:version.id,field:'stimuli'}}},select:{id:true,sha256:true,mimeType:true}})
  if(refs.all.some(ref=>!rows.some(row=>row.id===ref.assetId&&row.sha256===ref.contentHash&&row.mimeType===ref.mimeType)))
   privateToolFail('PRIVATE_FORM_RUNTIME_MEDIA_IDENTITY_INVALID')
  await assertAssessmentAssetReferencesReady(refs.all,tx)
 }
 return {version,...compiled}
}
export function privateFormResourceEntry(origin:PrivateFormOrigin,title:string,compositeId:string,releaseStatus:'DRAFT'|'PUBLISHED'='DRAFT'){
 const [population,responseMode]=origin.variantKey.split(':'),v=privateFormVariant(origin.entry,{population,responseMode})
 const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]},policyKey='EDUCATION_PRIVATE_FORM_V1'
 const entry:RelationalProductEntryV1&{privateFormOrigin:PrivateFormOrigin}={privateFormOrigin:origin,
  title,description:'作者私有表单固定版本；使用受活动授权与任务权限约束。',releaseStatus,scienceMaturity:'PILOT',
  initiationModes:v.responseMode==='SELF'?['ORG_ASSIGN','CLASS_ASSIGN']:['ORG_ASSIGN','RELATED_OBSERVER_ASSIGN'],subjectReportMode:'NONE',
  applicability:{schemaVersion:1,resourceKind:'FORM',resourceKey:privateFormResourceKey(origin),resourceVersion:origin.adapterVersion,
   subjectRoles:[v.subjectRole],respondentRoles:[v.respondentRole],relationshipKinds:[...v.relationshipKinds],perspectives:[v.perspective],
   analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:v.responseMode==='SELF'?policyKey:'observer_private_respondent_v1',minimumRespondents:null},
  ...(v.population==='STUDENT'&&v.responseMode==='TEACHER_REPORT'?{allowedTargetModes:['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS'] as const}:{}),
  cohortAnalysisPolicy:null,launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:compositeId},
  resultDisclosure:{schemaVersion:1,policyKey,minimumRespondents:null,audiences:{RESPONDENT:none,SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}}
 createRelationalProductRegistry([entry]);return entry
}
