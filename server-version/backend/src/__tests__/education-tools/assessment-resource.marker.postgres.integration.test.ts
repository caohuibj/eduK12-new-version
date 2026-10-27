import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import * as tools from '../../modules/education-tools/private-tool.service'
import {preparePrivateScaleRuntimeResource} from '../../modules/education-tools/private-tool.runtime-resources'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import * as service from '../../modules/education-tools/assessment-resource.service'
import {prepareTrainingContentAttemptBinding} from '../../modules/composite/training-content-binding'
import {readEducationMarkerSource} from '../../modules/education-tools/assessment-resource.marker'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
import type {EducationAssessmentContext} from '../../modules/education-tools/assessment-resource.issuer'
const url=integrationDatabaseUrl('EDUCATION_MARKER_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('Education privateVersion real persisted source and shared START binding',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY||='ab'.repeat(32);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 it('retains an owned exact version in an independent education runtime and rejects a forged source-item mapping',async()=>{
  const system=await db.user.create({data:{username:'marker-system-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',role:'ADMIN'}})
  const organizationId=randomUUID();await db.organization.create({data:{id:organizationId,name:'Synthetic marker school',productDomain:'SCHOOL',createdByUserId:system.id}})
  await db.educationProductEntitlement.create({data:{organizationId,product:'HUITEACHER',grantedByUserId:system.id}})
  async function actor(){
   const user=await db.user.create({data:{username:'marker-author-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
   const membershipId=randomUUID();await db.organizationMembership.create({data:{id:membershipId,organizationId,userId:user.id}})
   await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system.id}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId,membershipId,persona:'COUNSELOR',grantedByUserId:system.id}})
   await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId,membershipId,capability:'PSYCHOLOGY_STAFF',grantedByUserId:system.id}})
   const context:EducationAssessmentContext={product:'TEACHER',organizationId,principal:{userId:user.id,username:user.username,role:'TEACHER',platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false}}
   return {user,context}
  }
  const author=await actor(),reviewer=await actor(),c={entry:'TEACHER' as const,organizationId,principal:author.context.principal}
  const draft=await tools.createPrivateTool(c,{kind:'SCALE',title:'Synthetic private marker'})
  const definition=compileResearchScale(draft.title,{schemaVersion:1,respondentType:'teacher_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}]})
  const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:draft.revision,title:draft.title,definition})
  const version=await tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  const original=await db.$transaction(tx=>preparePrivateScaleRuntimeResource(tx,c,{versionId:version.id,contentHash:version.contentHash,administration:{population:'TEACHER',responseMode:'SELF'}}))
  const resourceIds=[original.compositeId,original.origin.releaseId]
  const issued=await issueAdminContentRoot(system.id,{tokenVersion:0,adminSessionId:'synthetic-proof',adminVerifiedAt:Date.now()/1000},{requestId:randomUUID(),expectedVersion:0,reason:'Explicit exact private marker fixture',grant:{subjectId:author.user.id,scope:{product:'TEACHER',scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:resourceIds},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const licenses=resourceIds.map(resourceId=>({resourceId,grantId:issued.grantId}))
  const p=await service.prepareEducationAssessment(author.context,{resourceId:randomUUID(),sourceCompositeId:original.compositeId,title:'Owned private bundle',family:'BUNDLE',licenses})
  const registered=await service.registerEducationAssessment(author.context,p.resourceId,{expectedPreparationHash:p.preparationHash,disclosure:testDisclosure(),references:{schemaVersion:1,units:[]},reports:[],licenses})
  await service.transitionEducationAssessment(reviewer.context,p.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent fixture review'})
  await service.transitionEducationAssessment(reviewer.context,p.resourceId,'PUBLISH',{expectedEntryHash:registered.entryHash,reason:'Fixture publication'})
  const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:p.runtimeCompositeId},include:{items:{include:{scale:true,cognitiveAssignment:{include:{config:true}}}}}})
  const snapshot=runtime.trainingContentSnapshot as any,binding=snapshot.units[0].source.educationBinding
  expect(snapshot.units[0].source.privateVersionId).toBe(version.id)
  expect(binding).toMatchObject({sourceCompositeId:original.compositeId,sourceItemId:original.compositeItemId,runtimeCompositeId:runtime.id,runtimeItemId:runtime.items[0].id})
  const candidate=await db.$transaction(tx=>prepareTrainingContentAttemptBinding(tx,{compositeId:runtime.id,attemptId:randomUUID(),epoch:1,snapshot,snapshotHash:runtime.trainingContentSnapshotHash,composite:runtime,resolvedSituational:new Map()}))
  expect(candidate?.binding.units[0].source.privateVersionId).toBe(version.id)
  await expect(db.$transaction(tx=>readEducationMarkerSource(tx,{...binding,sourceItemId:randomUUID()},{compositeId:runtime.id,itemId:runtime.items[0].id,ownerId:author.user.id}))).rejects.toThrow('MARKER_IDENTITY')
 })
})
