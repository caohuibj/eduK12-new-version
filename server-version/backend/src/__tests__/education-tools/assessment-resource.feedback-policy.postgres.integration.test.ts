import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
import type {EducationAssessmentContext} from '../../modules/education-tools/assessment-resource.issuer'
import * as service from '../../modules/education-tools/assessment-resource.service'
const url=integrationDatabaseUrl('EDUCATION_MARKER_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('education registration freezes explicit feedback timing in real PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 it('stores normalized UTC in the frozen entry, replays equivalent input and rejects changing a registered schedule',async()=>{
  const system=await db.user.create({data:{username:'feedback-system-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',role:'ADMIN'}})
  const organizationId=randomUUID();await db.organization.create({data:{id:organizationId,name:'Synthetic feedback timing',productDomain:'SCHOOL',createdByUserId:system.id}})
  await db.educationProductEntitlement.create({data:{organizationId,product:'HUITEACHER',grantedByUserId:system.id}})
  async function actor(){const user=await db.user.create({data:{username:'feedback-author-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}});const membershipId=randomUUID();await db.organizationMembership.create({data:{id:membershipId,organizationId,userId:user.id}});await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system.id}});return {product:'TEACHER',organizationId,principal:{userId:user.id,username:user.username,role:'TEACHER',platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false}} as EducationAssessmentContext}
  const author=await actor(),reviewer=await actor(),sourceId=randomUUID(),sectionId=randomUUID()
  // An explicit synthetic published Form fixture; no measurement/report or
  // assumed instrument approval is manufactured for this timing-only case.
  await db.compositeAssessment.create({data:{id:sourceId,code:randomUUID(),name:'Synthetic published Form source',createdBy:system.id,status:'PUBLISHED',publishedAt:new Date(),formSections:{create:{id:sectionId,title:'Synthetic Form section',position:0}},items:{create:{type:'FORM',required:true,position:0,formType:'fill_blank',formLabel:'Synthetic question',formSectionId:sectionId,formSectionPosition:0}}}})
  const grant=await issueAdminContentRoot(system.id,{tokenVersion:0,adminSessionId:'synthetic-proof',adminVerifiedAt:Date.now()/1000},{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic feedback source authority',grant:{subjectId:author.principal.userId,scope:{product:'TEACHER',scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:[sourceId]},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const licenses=[{resourceId:sourceId,grantId:grant.grantId}],p=await service.prepareEducationAssessment(author,{resourceId:randomUUID(),sourceCompositeId:sourceId,title:'Explicit scheduled feedback',family:'BUNDLE',licenses})
  const input={expectedPreparationHash:p.preparationHash,disclosure:testDisclosure(),references:{schemaVersion:1,units:[]},reports:[],licenses,feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-10-29T20:30:00+08:00'}}
  const registered=await service.registerEducationAssessment(author,p.resourceId,input),policy={schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-10-29T12:30:00.000Z'}
  expect(registered.entry.educationOrigin.feedbackPolicy).toEqual(policy)
  expect(await service.registerEducationAssessment(author,p.resourceId,{...input,feedbackPolicy:policy})).toMatchObject({entryHash:registered.entryHash,status:'DRAFT'})
  await expect(service.registerEducationAssessment(author,p.resourceId,{...input,feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'}})).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_ALREADY_FROZEN'})
  const stored=await service.readEducationAssessmentRegistration(author,p.resourceId)
  expect(stored.entryHash).toBe(canonicalHash(stored.entry));expect((stored.entry.educationOrigin as any).feedbackPolicy).toEqual(policy)
  await service.transitionEducationAssessment(reviewer,p.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent timing review'})
  const published=await service.transitionEducationAssessment(reviewer,p.resourceId,'PUBLISH',{expectedEntryHash:registered.entryHash,reason:'Publish explicit immutable timing'})
  const identity=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:published.version,purpose:'HISTORY'}))
  expect(identity.origin.feedbackPolicy).toEqual(policy)
 })
 it.runIf(Boolean(process.env.EDUCATION_PRIVATE_MARKER_RESOURCE_ID))('reads a prior real publication without inserting a policy or changing its original entry hash',async()=>{
  const id=process.env.EDUCATION_PRIVATE_MARKER_RESOURCE_ID!
  const [row]=await db.$queryRaw<Array<{product:'SCHOOL'|'TEACHER';organization_id:string;created_by_user_id:string;entry_hash:string;entry:any}>>`SELECT product,organization_id,created_by_user_id,entry_hash,entry FROM education_assessment_deliveries WHERE id=${id}`
  expect(row.entry.educationOrigin).not.toHaveProperty('feedbackPolicy')
  const user=await db.user.findUniqueOrThrow({where:{id:row.created_by_user_id}}),context:EducationAssessmentContext={product:row.product,organizationId:row.organization_id,principal:{userId:user.id,username:user.username,role:user.role,platformRole:user.platformRole,accountDomain:user.accountDomain,tokenVersion:user.tokenVersion,mustChangePassword:user.mustChangePassword}}
  const result=await service.readEducationAssessmentRegistration(context,id)
  expect(result.entryHash).toBe(row.entry_hash);expect(canonicalHash(result.entry)).toBe(row.entry_hash)
  expect(result.entry.educationOrigin).not.toHaveProperty('feedbackPolicy')
 })
})
