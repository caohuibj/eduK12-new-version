import {randomUUID} from 'node:crypto'
import {getContentRelease,publishContentRelease} from '../../modules/measurement-content/repository'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {getScaleInstrumentSource,getScaleInstrumentRuntimePolicy} from '../../modules/scale/onboarding/instrument-registry'
import {installScaleInstrument} from '../../modules/scale/onboarding/install'
import {planStandardScalePublication,publishStandardScale} from '../../modules/scale/onboarding/publish'
import {standardTripletDetail,previewStandardTriplet,approveStandardTriplet} from '../../modules/survey/standard-triplet.service'
import {grantTrainingStandardCombinationUse} from '../../modules/measurement-content/standard-combination-use'
import {prepareTrainingStandardItemSource,verifyStoredTrainingStandardItem} from '../../modules/composite/training-standard-combination'
import {readTrainingStandardContentIdentity} from '../../modules/composite/training-standard-content'
import {publishComposite} from '../../modules/composite/composite.service'
import {prepareTrainingContentAttemptBinding} from '../../modules/composite/training-content-binding'
import {assertTrainingStandardCollectionAllowed} from '../../modules/composite/training-standard-collection'
import {revokeTrainingStandardCombinationUse} from '../../modules/measurement-content/standard-combination-use'
import {revokeContentAuthority} from '../../modules/measurement-content/content-authority.repository'
import {validateTrainingReferenceRelease} from '../../modules/composite/training-reference-selection'
import {validateTrainingReportPointer} from '../../modules/composite/training-report-selection'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import * as service from '../../modules/education-tools/assessment-resource.service'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
import type {EducationAssessmentContext} from '../../modules/education-tools/assessment-resource.issuer'
const url=integrationDatabaseUrl('EDUCATION_MARKER_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('Education exact standard marker real approved source',()=>{
 let completedResourceId:string|undefined
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY||='ab'.repeat(32);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 it('performs actual approval/trials and preserves original Training rights in a separately authorized School runtime',async()=>{
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
  const marker=await db.$transaction(tx=>prepareTrainingStandardItemSource(tx,teacher.id,original,{id:original.items[0].id,scaleId:installed.scaleId!},combination))
  await db.compositeAssessmentItem.update({where:{id:original.items[0].id},data:{standardCombinationSource:{reference:marker.reference,referenceHash:marker.referenceHash}}})
  await publishComposite(teacher.id,'TEACHER',original.id)
  const organizationId=randomUUID();await db.organization.create({data:{id:organizationId,name:'Synthetic standard target',productDomain:'SCHOOL',createdByUserId:system.id}})
  await db.educationProductEntitlement.create({data:{organizationId,product:'HUISCHOOL',grantedByUserId:system.id}})
  async function actor(){const user=await db.user.create({data:{username:'std-marker-target-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}});const membershipId=randomUUID();await db.organizationMembership.create({data:{id:membershipId,organizationId,userId:user.id}});await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId,product:'HUISCHOOL',role:'PRODUCT_ADMIN',grantedByUserId:system.id}});return {product:'SCHOOL',organizationId,principal:{userId:user.id,username:user.username,role:'TEACHER',platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false}} as EducationAssessmentContext}
  const author=await actor(),reviewer=await actor(),ids=[original.id,marker.reference.measurement.releaseId]
  const grant=await issueAdminContentRoot(system.id,{tokenVersion:0,adminSessionId:'synthetic-proof',adminVerifiedAt:Date.now()/1000},{requestId:randomUUID(),expectedVersion:0,reason:'Separate School exact source authority',grant:{subjectId:author.principal.userId,scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:ids},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const licenses=ids.map(resourceId=>({resourceId,grantId:grant.grantId})),p=await service.prepareEducationAssessment(author,{resourceId:randomUUID(),sourceCompositeId:original.id,title:'School exact standard source',family:'BUNDLE',licenses})
  const registered=await service.registerEducationAssessment(author,p.resourceId,{expectedPreparationHash:p.preparationHash,disclosure:testDisclosure(),feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[]},reports:[],licenses})
  await service.transitionEducationAssessment(reviewer,p.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent School fixture review'})
  await service.transitionEducationAssessment(reviewer,p.resourceId,'PUBLISH',{expectedEntryHash:registered.entryHash,reason:'School fixture publication'})
  const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:p.runtimeCompositeId},include:{items:{include:{scale:true}}}}),unit=(runtime.trainingContentSnapshot as any).units[0]
  const exact=await db.$transaction(tx=>verifyStoredTrainingStandardItem(tx,runtime,runtime.items[0],'COLLECTION'))
  expect(exact.referenceHash).toBe(marker.referenceHash)
  const candidate=await db.$transaction(tx=>prepareTrainingContentAttemptBinding(tx,{compositeId:runtime.id,attemptId:randomUUID(),epoch:1,snapshot:runtime.trainingContentSnapshot,snapshotHash:runtime.trainingContentSnapshotHash,composite:runtime,resolvedSituational:new Map()}))
  expect(candidate?.binding.units[0].source.educationBinding?.sourceItemId).toBe(original.items[0].id)
  await db.$transaction(tx=>readTrainingStandardContentIdentity(tx,unit,{compositeId:runtime.id,ownerId:author.principal.userId}))
  await expect(db.$transaction(tx=>readTrainingStandardContentIdentity(tx,{...unit,source:{...unit.source,educationBinding:{...unit.source.educationBinding,runtimeItemId:randomUUID()}}},{compositeId:runtime.id,ownerId:author.principal.userId}))).rejects.toThrow('MARKER_IDENTITY')
  completedResourceId=p.resourceId
 })
 it('checks exact original use at collection, rejects revocation and keeps frozen identity independently readable',async()=>{
  // A separate targeted invocation can resume an explicitly named fixture from
  // the preceding successful real approval/publication, without repeating it.
  const resourceId=completedResourceId??process.env.EDUCATION_STANDARD_MARKER_RESOURCE_ID
  if(!resourceId)throw new Error('Run the preparation case or provide its isolated fixture resource ID')
  const [row]=await db.$queryRaw<Array<{runtime_composite_id:string;entry:any}>>`SELECT runtime_composite_id,entry FROM education_assessment_deliveries WHERE id=${resourceId}`
  const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:row.runtime_composite_id},include:{items:{include:{scale:true}}}})
  const unit=(runtime.trainingContentSnapshot as any).units[0],marker=unit.source.standardCombination.reference
  const attemptId=randomUUID(),candidate=await db.$transaction(tx=>prepareTrainingContentAttemptBinding(tx,{compositeId:runtime.id,attemptId,epoch:1,snapshot:runtime.trainingContentSnapshot,snapshotHash:runtime.trainingContentSnapshotHash,composite:runtime,resolvedSituational:new Map()}))
  const parent=await db.compositeAssessmentAttempt.create({data:{id:attemptId,compositeAssessmentId:runtime.id,participantKey:'synthetic-marker-'+attemptId,trainingContentBinding:candidate!.binding,trainingContentBindingHash:candidate!.bindingHash}})
  expect(await db.$transaction(tx=>assertTrainingStandardCollectionAllowed(tx,parent.id,[runtime.items[0].scaleId!],[runtime.items[0].id]))).toEqual(new Set([runtime.items[0].scaleId]))
  await revokeTrainingStandardCombinationUse(marker.authority.issuerId,marker.authority.useGrantId,{expectedVersion:marker.authority.useGrantVersion,reason:'Synthetic exact upstream withdrawal'})
  await expect(db.$transaction(tx=>assertTrainingStandardCollectionAllowed(tx,parent.id,[runtime.items[0].scaleId!],[runtime.items[0].id]))).rejects.toThrow('使用授权不可用')
  await db.$transaction(tx=>readTrainingStandardContentIdentity(tx,unit,{compositeId:runtime.id,ownerId:runtime.createdBy!}))
  const distribution=row.entry.educationOrigin.distribution
  await db.$transaction(tx=>revokeContentAuthority(tx,{actorId:distribution.actorId,grantId:distribution.grants[0].grantId,expectedVersion:distribution.grants[0].version,reason:'Synthetic exact target withdrawal'}))
  await expect(db.$transaction(tx=>verifyStoredTrainingStandardItem(tx,runtime,runtime.items[0],'COLLECTION'))).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  await db.$transaction(tx=>readTrainingStandardContentIdentity(tx,unit,{compositeId:runtime.id,ownerId:runtime.createdBy!}))
 })
 it('selects exact approved PLATFORM parameters and a teacher-audience report for an independently reviewed Teacher delivery',async()=>{
  const fixtureId=completedResourceId??process.env.EDUCATION_STANDARD_MARKER_RESOURCE_ID
  if(!fixtureId)throw new Error('Run the preparation case or provide its isolated fixture resource ID')
  const [prior]=await db.$queryRaw<Array<{source_composite_id:string;entry:any}>>`SELECT source_composite_id,entry FROM education_assessment_deliveries WHERE id=${fixtureId}`
  const upstream=await db.compositeAssessment.findUniqueOrThrow({where:{id:prior.source_composite_id},include:{items:true}})
  const previous=(upstream.trainingContentSnapshot as any).units[0].source.standardCombination.reference
  const use=await db.materialGrant.findUniqueOrThrow({where:{id:previous.authority.useGrantId}})
  await grantTrainingStandardCombinationUse(previous.authority.issuerId,previous.combination.releaseId,{requestId:randomUUID(),userId:upstream.createdBy!,combinationHash:previous.combination.combinationHash,...(use.revokedAt?{expectedUseVersion:use.version}:{})})
  // A reissue gets a new source and frozen marker; it cannot revive the old one.
  const course=await db.course.create({data:{creatorId:upstream.createdBy!,title:'Synthetic new exact source',courseCode:randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  const original=await db.compositeAssessment.create({data:{code:randomUUID(),name:'New standard source for Teacher',createdBy:upstream.createdBy!,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',questionnaireCourses:{create:{courseId:course.id}},items:{create:{type:'SCALE',scaleId:upstream.items[0].scaleId,required:true,position:0}}},include:{questionnaireCourses:true,items:{include:{scale:true}}}})
  const marker=await db.$transaction(tx=>prepareTrainingStandardItemSource(tx,upstream.createdBy!,original,{id:original.items[0].id,scaleId:original.items[0].scaleId!},previous.combination))
  await db.compositeAssessmentItem.update({where:{id:original.items[0].id},data:{standardCombinationSource:{reference:marker.reference,referenceHash:marker.referenceHash}}})
  await publishComposite(upstream.createdBy!,'TEACHER',original.id)
  const frozen=await db.compositeAssessment.findUniqueOrThrow({where:{id:original.id}}),sourceUnit=(frozen.trainingContentSnapshot as any).units[0]
  expect(sourceUnit.referencePolicy.choices.length).toBeGreaterThan(0);expect(sourceUnit.report).toBeTruthy()
  const root=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:prior.entry.educationOrigin.distribution.grants[0].grantId}}),systemId=root.issuerId,organizationId=randomUUID()
  await db.organization.create({data:{id:organizationId,name:'Synthetic exact Teacher target',productDomain:'SCHOOL',createdByUserId:systemId}})
  await db.educationProductEntitlement.create({data:{organizationId,product:'HUITEACHER',grantedByUserId:systemId}})
  async function actor(){const user=await db.user.create({data:{username:'std-marker-teacher-target-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}});const membershipId=randomUUID();await db.organizationMembership.create({data:{id:membershipId,organizationId,userId:user.id}});await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:systemId}});return {product:'TEACHER',organizationId,principal:{userId:user.id,username:user.username,role:'TEACHER',platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false}} as EducationAssessmentContext}
  const author=await actor(),reviewer=await actor(),base=[original.id,sourceUnit.measurement.releaseId],all=[...new Set([...base,...sourceUnit.referencePolicy.choices.map((v:any)=>v.releaseId),sourceUnit.report.releaseId])] as string[]
  const grant=await issueAdminContentRoot(systemId,{tokenVersion:0,adminSessionId:'synthetic-proof',adminVerifiedAt:Date.now()/1000},{requestId:randomUUID(),expectedVersion:0,reason:'Separate Teacher source and precise C/P/R authority',grant:{subjectId:author.principal.userId,scope:{product:'TEACHER',scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:all},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const licenses=all.map(resourceId=>({resourceId,grantId:grant.grantId})),p=await service.prepareEducationAssessment(author,{resourceId:randomUUID(),sourceCompositeId:original.id,title:'Teacher approved standard parameters/report',family:'BUNDLE',licenses:licenses.filter(v=>base.includes(v.resourceId))})
  const itemId=p.units[0].itemId,registered=await service.registerEducationAssessment(author,p.resourceId,{expectedPreparationHash:p.preparationHash,disclosure:testDisclosure(),feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[{itemId,choices:sourceUnit.referencePolicy.choices.map(({releaseId,entryKey,priority}:any)=>({releaseId,entryKey,priority}))}]},reports:[{itemId,releaseId:sourceUnit.report.releaseId}],licenses})
  await service.transitionEducationAssessment(reviewer,p.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent exact Teacher P/R review'})
  await service.transitionEducationAssessment(reviewer,p.resourceId,'PUBLISH',{expectedEntryHash:registered.entryHash,reason:'Teacher exact P/R publication'})
  const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:p.runtimeCompositeId},include:{items:{include:{scale:true}}}}),unit=(runtime.trainingContentSnapshot as any).units[0]
  const candidate=await db.$transaction(tx=>prepareTrainingContentAttemptBinding(tx,{compositeId:runtime.id,attemptId:randomUUID(),epoch:1,snapshot:runtime.trainingContentSnapshot,snapshotHash:runtime.trainingContentSnapshotHash,composite:runtime,resolvedSituational:new Map()}))
  expect(candidate?.binding.units[0].report).toEqual(sourceUnit.report)
  await db.$transaction(async tx=>{
   const releases=new Map<string,any>()
   for(const choice of unit.referencePolicy.choices)await validateTrainingReferenceRelease(tx,{unit,ownerId:author.principal.userId,compositeId:runtime.id,releaseId:choice.releaseId,purpose:'HISTORY',releases})
   await validateTrainingReportPointer(tx,{unit,ownerId:author.principal.userId,compositeId:runtime.id,reportReleaseId:unit.report.releaseId,publication:false,releases})
  })
 })
 it('continues published exact education target reports through real STANDARD attempt binding for both products',async()=>{
  const resourceId=completedResourceId??process.env.EDUCATION_STANDARD_MARKER_RESOURCE_ID
  if(!resourceId)throw new Error('A separately prepared isolated STANDARD source is required')
  const [prior]=await db.$queryRaw<Array<{source_composite_id:string;entry:any}>>`SELECT source_composite_id,entry FROM education_assessment_deliveries WHERE id=${resourceId}`
  const original=await db.compositeAssessment.findUniqueOrThrow({where:{id:prior.source_composite_id}})
  const sourceUnit=(original.trainingContentSnapshot as any).units[0]
  const grantRoot=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:prior.entry.educationOrigin.distribution.grants[0].grantId}})
  const systemId=grantRoot.issuerId
  const originalReport=await db.$transaction(tx=>getContentRelease(tx,sourceUnit.report.releaseId,true))
  if(!originalReport||originalReport.layer!=='REPORT')throw new Error('Exact approved original report required')
  for(const product of ['SCHOOL','TEACHER'] as const){
   const organizationId=randomUUID(),entry=product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'
   await db.organization.create({data:{id:organizationId,name:'Synthetic exact target report '+product,productDomain:'SCHOOL',createdByUserId:systemId}})
   await db.educationProductEntitlement.create({data:{organizationId,product:entry,grantedByUserId:systemId}})
   const actor=async()=>{
    const user=await db.user.create({data:{username:'target-report-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
    const membershipId=randomUUID();await db.organizationMembership.create({data:{id:membershipId,organizationId,userId:user.id}})
    await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId,product:entry,role:'PRODUCT_ADMIN',grantedByUserId:systemId}})
    return {product,organizationId,principal:{userId:user.id,username:user.username,role:'TEACHER',platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false}} as EducationAssessmentContext
   }
   const author=await actor(),reviewer=await actor()
   const grant=async(ids:string[])=>{
    const root=await issueAdminContentRoot(systemId,{tokenVersion:0,adminSessionId:'synthetic-proof',adminVerifiedAt:Date.now()/1000},{requestId:randomUUID(),expectedVersion:0,reason:'Exact synthetic target report authorization',grant:{subjectId:author.principal.userId,scope:{product,scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:ids},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
    return ids.map(resourceId=>({resourceId,grantId:root.grantId}))
   }
   const baseLicenses=await grant([original.id,sourceUnit.measurement.releaseId])
   const preparation=await service.prepareEducationAssessment(author,{resourceId:randomUUID(),sourceCompositeId:original.id,title:'Authorized target '+product,family:'BUNDLE',licenses:baseLicenses})
   const target=await db.$transaction(tx=>publishContentRelease(tx,{layer:'REPORT',family:'SCALE',key:'synthetic-target:'+preparation.resourceId,version:'1.0.0',scope:{kind:'PRIVATE',product,ownerId:author.principal.userId,resourceId:preparation.runtimeCompositeId},assetRefs:originalReport.assetRefs,sourceReleaseId:originalReport.releaseId,provenance:{sourceReportHash:originalReport.contentHash,syntheticTarget:true},content:{...originalReport.content,audience:product==='SCHOOL'?'student':'teacher'}},author.principal.userId))
   const licenses=[...baseLicenses,...await grant([target.releaseId])],itemId=preparation.units[0].itemId
   const registered=await service.registerEducationAssessment(author,preparation.resourceId,{expectedPreparationHash:preparation.preparationHash,disclosure:testDisclosure(),feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[]},reports:[{itemId,releaseId:target.releaseId}],licenses})
   await service.transitionEducationAssessment(reviewer,preparation.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent target report review'})
   await service.transitionEducationAssessment(reviewer,preparation.resourceId,'PUBLISH',{expectedEntryHash:registered.entryHash,reason:'Exact target report publication'})
   const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:preparation.runtimeCompositeId},include:{items:{include:{scale:true}}}})
   const bound=await db.$transaction(tx=>prepareTrainingContentAttemptBinding(tx,{compositeId:runtime.id,attemptId:randomUUID(),epoch:1,snapshot:runtime.trainingContentSnapshot,snapshotHash:runtime.trainingContentSnapshotHash,composite:runtime,resolvedSituational:new Map()}))
   expect(bound?.binding.units[0].report).toEqual({releaseId:target.releaseId,contentHash:target.contentHash})
   expect(bound?.binding.units[0].measurement).toEqual(sourceUnit.measurement)
   const unit=(runtime.trainingContentSnapshot as any).units[0]
   await expect(db.$transaction(tx=>validateTrainingReportPointer(tx,{unit,compositeId:runtime.id,ownerId:author.principal.userId,reportReleaseId:originalReport.releaseId,publication:false,releases:new Map()}))).rejects.toThrow('SCOPE_DENIED')
  }
 })

})
