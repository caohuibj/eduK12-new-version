import {randomUUID} from 'node:crypto'
import {expect} from 'vitest'
import type {PrismaClient} from '@prisma/client'
import {getScaleInstrumentSource,getScaleInstrumentRuntimePolicy} from '../../modules/scale/onboarding/instrument-registry'
import {installScaleInstrument} from '../../modules/scale/onboarding/install'
import {planStandardScalePublication,publishStandardScale} from '../../modules/scale/onboarding/publish'
import {standardTripletDetail,previewStandardTriplet,approveStandardTriplet} from '../../modules/survey/standard-triplet.service'
import {grantTrainingStandardCombinationUse} from '../../modules/measurement-content/standard-combination-use'
import {prepareTrainingStandardItemSource} from '../../modules/composite/training-standard-combination'
import {publishComposite} from '../../modules/composite/composite.service'
import * as tools from '../../modules/education-tools/private-tool.service'
import {preparePrivateScaleRuntimeResource} from '../../modules/education-tools/private-tool.runtime-resources'
import {compileResearchScale} from '../../modules/survey/builder.compiler'

/** Actual existing source services; isolated software fixture only. No accepted
 * attempt/answer/FINAL is manufactured. Standard source setup is the exact
 * root-reviewed installed test source, not a production distribution action. */
export async function standardMarkerSource(db:PrismaClient){
  const system=await db.user.create({data:{username:'std-marker-system-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',role:'ADMIN'}})
  const teacher=await db.user.create({data:{username:'std-marker-source-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'TEACHER',teacherApproved:true}})
  const key='academic_self_concept_biology_zh_cn',version='1.0.0',source=getScaleInstrumentSource(key,version)!,policy=getScaleInstrumentRuntimePolicy(key,version)!
  const installed=await installScaleInstrument(db,{instrumentKey:key,instrumentVersion:version,actorUserId:system.id,deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'],runtimePolicyHash:policy.runtimePolicyHash,localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'}})
  const pub={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['TRAINING' as const]}
  const plan=await planStandardScalePublication(db,pub);await publishStandardScale(db,{...pub,expectedProofHash:plan.proofHash})
  const detail=await standardTripletDetail(system.id,key,version),preview=await previewStandardTriplet(db,system.id,detail.selection)
  const approved=await approveStandardTriplet(system.id,{...detail.selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,reason:'Isolated marker adapter source approval',allowedProducts:['TRAINING']})
  expect(approved.state).toBe('ONLINE')
  expect(await db.$queryRaw`SELECT id FROM survey_standard_trials WHERE release_id=${approved.id}`).toHaveLength(3)
  const combination={releaseId:approved.id,combinationHash:approved.combinationHash}
  const distributor=await db.user.create({data:{username:'std-marker-distributor-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'ADMIN'}})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:distributor.id,entry:'TRAINING',grantedBy:system.id}})
  await expect(grantTrainingStandardCombinationUse(system.id,approved.id,{requestId:randomUUID(),userId:teacher.id,combinationHash:approved.combinationHash})).rejects.toThrow('系统管理员不能代替入口管理员')
  await grantTrainingStandardCombinationUse(distributor.id,approved.id,{requestId:randomUUID(),userId:teacher.id,combinationHash:approved.combinationHash})
  const course=await db.course.create({data:{creatorId:teacher.id,title:'Synthetic standard source',courseCode:randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  const original=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Original standard source',createdBy:teacher.id,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',questionnaireCourses:{create:{courseId:course.id}},items:{create:{type:'SCALE',scaleId:installed.scaleId,required:true,position:0}}},include:{questionnaireCourses:true,items:{include:{scale:true}}}})
  // The actual installed standard source requires gradeLevel before its Scale.
  // This fixture collects the participant fact; it does not skip applicability.
  const section=await db.compositeFormSection.create({data:{compositeAssessmentId:original.id,title:'Synthetic required grade',position:0,contextSection:true}})
  await db.compositeAssessmentItem.update({where:{id:original.items[0].id},data:{position:1}})
  original.items[0].position=1
  await db.compositeAssessmentItem.create({data:{compositeAssessmentId:original.id,type:'FORM',position:0,required:true,formSectionId:section.id,formSectionPosition:0,
   formType:'single_choice',formLabel:'Synthetic grade',contextKey:'gradeLevel',formOptions:[{value:'7',label:'七年级'}]}})
  const marker=await db.$transaction(tx=>prepareTrainingStandardItemSource(tx,teacher.id,original,{id:original.items[0].id,scaleId:installed.scaleId!},combination))
  await db.compositeAssessmentItem.update({where:{id:original.items[0].id},data:{standardCombinationSource:{reference:marker.reference,referenceHash:marker.referenceHash}}})
  await publishComposite(teacher.id,'TEACHER',original.id)

 return {system,original,resourceIds:[original.id,marker.reference.measurement.releaseId]}

}
export async function privateMarkerSource(db:PrismaClient,c:Parameters<typeof tools.createPrivateTool>[0]){
  const draft=await tools.createPrivateTool(c,{kind:'SCALE',title:'Synthetic private marker'})
  const definition=compileResearchScale(draft.title,{schemaVersion:1,respondentType:'teacher_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}]})
  const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:draft.revision,title:draft.title,definition})
  const version=await tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  const original=await db.$transaction(tx=>preparePrivateScaleRuntimeResource(tx,c,{versionId:version.id,contentHash:version.contentHash,administration:{population:'TEACHER',responseMode:'SELF'}}))

 return {original:{id:original.compositeId},resourceIds:[original.compositeId,original.origin.releaseId],version}
}
