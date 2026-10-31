import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {Prisma,PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {prisma} from '../../config/database'
import {SURVEY_GONOGO_CONFIG} from '../../modules/survey/cognitive.definition'
import {publishAssignmentMeasurementRelease} from '../../modules/cognitive/assignment-measurement-release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {publishContentRelease,getContentRelease} from '../../modules/measurement-content/repository'
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {createSjtDraft,requestSjtReview,reviewSjtDraft} from '../../modules/situational/authoring/service'
import {sjtNativeStagedTemplate} from '../fixtures/sjt-native-staged.fixture'
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
import {assertEducationAssessmentDistributionCurrent} from '../../modules/education-tools/assessment-resource.distribution'
import {educationAssessmentResourceRouter} from '../../modules/education-tools/assessment-resource.routes'
import {requireRecentSchoolMfa} from '../../modules/campus/mfa.middleware'
import {requireRecentTeacherMfa} from '../../modules/huiteacher/authority'
import {authenticateSchool,authenticateHuiteacher} from '../../middleware/auth'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,AUTH_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
import type {EducationAssessmentContext} from '../../modules/education-tools/assessment-resource.issuer'
import * as service from '../../modules/education-tools/assessment-resource.service'
import {testReference} from '../assessment-reference/wave1-reference.fixture'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import {formQuestionSchema} from '../../modules/assessment-core/form/definition'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {publishScaleMeasurement} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {DECLARATIVE_REPORT_GENERATOR} from '../../modules/measurement-content/report-renderer'

const url=integrationDatabaseUrl('EDUCATION_ASSESSMENT_PUBLICATION_TEST_DATABASE_URL'),suite=url?describe:describe.skip
type Product='TEACHER'|'SCHOOL'
type Source='COGNITIVE'|'SITUATIONAL'|'MIXED'|'FORM'|'ALL_FOUR'
let db:PrismaClient,server:Server,base:string
const proof=()=>({tokenVersion:0,adminSessionId:'synthetic-strong-admin-proof',adminVerifiedAt:Date.now()/1000})
async function fixture(product:Product='TEACHER',kind:Source='COGNITIVE'){
 const system=await db.user.create({data:{username:'synthetic-system-'+randomUUID(),passwordHash:'synthetic-no-login',accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
 const organizationId=randomUUID()
 await db.organization.create({data:{id:organizationId,name:'Synthetic publication only',createdByUserId:system.id,productDomain:'SCHOOL'}})
 await db.educationProductEntitlement.create({data:{organizationId,product:product==='TEACHER'?'HUITEACHER':'HUISCHOOL',grantedByUserId:system.id}})
 async function actor(psychology=false){
  const user=await db.user.create({data:{username:'synthetic-education-'+randomUUID(),passwordHash:'synthetic-no-login',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const membership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:user.id}})
  let grantId:string
  if(psychology){
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId,membershipId:membership.id,persona:'COUNSELOR',grantedByUserId:system.id}})
   const grant=await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId,membershipId:membership.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:system.id}});grantId=grant.id
  }else{
   const grant=await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId:membership.id,product:product==='TEACHER'?'HUITEACHER':'HUISCHOOL',role:'PRODUCT_ADMIN',grantedByUserId:system.id}});grantId=grant.id
  }
  const context:EducationAssessmentContext={product,organizationId,principal:{userId:user.id,username:user.username,accountDomain:'SCHOOL',role:'TEACHER',platformRole:'STANDARD',tokenVersion:user.tokenVersion,mustChangePassword:false}}
  return {user,membership,grantId,context}
 }
 const creator=await actor(),reviewer=await actor(true)
 const compositeId=randomUUID(),items:any[]=[],units:any[]=[],sectionId=randomUUID()
 if(kind==='COGNITIVE'||kind==='MIXED'||kind==='ALL_FOUR'){
  const config=await db.cognitiveTestConfig.upsert({where:{testType_configVersion:{testType:'gonogo',configVersion:'1.1.0'}},
   create:{testType:'gonogo',configVersion:'1.1.0',name:'Synthetic installed gonogo parameters',status:'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:SURVEY_GONOGO_CONFIG},update:{}})
  const assignment=await db.cognitiveAssignment.create({data:{configId:config.id,createdBy:system.id,title:'Synthetic assignment',status:'PUBLISHED'}})
  const measurement=await db.$transaction(tx=>publishAssignmentMeasurementRelease(tx,system.id,assignment.id))
  const id=randomUUID();items.push({id,type:'COGNITIVE',position:items.length,required:true,cognitiveAssignmentId:assignment.id})
  units.push({itemId:id,family:'COGNITIVE',source:{kind:'COGNITIVE_CONFIG',id:config.id,ownerId:system.id,assignmentId:assignment.id},measurement})
 }
 if(kind==='SITUATIONAL'||kind==='MIXED'||kind==='ALL_FOUR'){
  const template={...structuredClone(sjtNativeStagedTemplate),instrumentKey:'synthetic-education-'+randomUUID(),respondentType:product==='TEACHER'?'teacher_self_report' as const:'student_self_report' as const}
  const draft=await createSjtDraft({userId:creator.user.id,admin:false},template)
  await requestSjtReview({userId:creator.user.id,admin:false},draft.id,draft.revision,draft.contentDigest)
  await reviewSjtDraft({userId:system.id,admin:true},draft.id,draft.revision,draft.contentDigest,true,'Independent approval of synthetic self-authored test tool')
  const release=await db.sjtAuthorRelease.findFirstOrThrow({where:{sourceDraftId:draft.id}})
  const measurement=await db.$transaction(tx=>getContentRelease(tx,release.measurementReleaseId!))
  if(!measurement||measurement.layer!=='MEASUREMENT')throw new Error('Actual measurement publication required')
  const id=randomUUID();items.push({id,type:'SITUATIONAL',position:items.length,required:true,situationalInstrumentKey:release.instrumentKey,situationalInstrumentVersion:release.instrumentVersion})
  units.push({itemId:id,family:'SJT',source:{kind:'SJT_AUTHOR_RELEASE',id:release.id,ownerId:creator.user.id,instrumentKey:release.instrumentKey,instrumentVersion:release.instrumentVersion},
   measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.content.measurementHash}})
 }
 if(kind==='ALL_FOUR'){
  const definition=compileResearchScale('Synthetic descriptive Scale',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:product==='TEACHER'?'teacher_self_report':'student_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
   items:[{itemKey:'q',prompt:'Self-authored synthetic question',required:true,reverse:false,dimensionKeys:['total']}]}),code='synthetic-education-scale-'+randomUUID()
  const scale=await db.scale.create({data:{code,name:'Synthetic owned Scale',creatorId:system.id,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',definition,definitionHash:hashScaleDefinition(definition)}})
  const measurement=await db.$transaction(tx=>publishScaleMeasurement(tx,{localId:scale.code,version:'1.0.0',instrumentVersion:scale.instrumentVersion,
   definition,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:system.id,resourceId:scale.id}},system.id))
  await db.scale.update({where:{id:scale.id},data:{measurementReleaseId:measurement.releaseId}})
  const id=randomUUID();items.push({id,type:'SCALE',position:items.length,required:true,scaleId:scale.id})
  units.push({itemId:id,family:'SCALE',source:{kind:'SCALE',id:scale.id,ownerId:system.id},measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.content.measurementHash}})
 }
 if(kind==='FORM'||kind==='MIXED'||kind==='ALL_FOUR')items.push({id:randomUUID(),type:'FORM',position:items.length,required:true,formType:'fill_blank',formLabel:'Synthetic Form question',formSectionId:sectionId,formSectionPosition:0})
 const snapshot={schemaVersion:1,compositeId,units}
 await db.compositeAssessment.create({data:{id:compositeId,code:randomUUID(),createdBy:system.id,name:'Synthetic source only',status:'PUBLISHED',publishedAt:new Date(),
  ...(units.length?{trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}:{}),
  ...(['FORM','MIXED','ALL_FOUR'].includes(kind)?{formSections:{create:{id:sectionId,title:'Synthetic Form',position:items.length-1}}}:{}),items:{create:items}}})
 async function grant(resourceIds:string[],target=creator.user.id,targetProduct=product){
  return issueAdminContentRoot(system.id,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Explicit scoped redistribution of self-authored synthetic test sources only',
   grant:{subjectId:target,scope:{product:targetProduct,scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:resourceIds},capabilities:['material.distribute'],
    delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
 }
 const resourceIds=[compositeId,...units.map(unit=>unit.measurement.releaseId)]
 const distribution=await grant(resourceIds)
 const licenses=resourceIds.map(resourceId=>({resourceId,grantId:distribution.grantId}))
 const family=kind==='MIXED'||kind==='FORM'||kind==='ALL_FOUR'?'BUNDLE' as const:kind
 const prepareInput={resourceId:randomUUID(),sourceCompositeId:compositeId,title:'Synthetic education delivery',family,licenses}
 const prepare=()=>service.prepareEducationAssessment(creator.context,prepareInput)
 return {product,kind,system,organizationId,creator,reviewer,compositeId,units,grant,distribution,licenses,prepareInput,prepare,actor}
}
function registration(preparation:{preparationHash:string},licenses:unknown[]){return {expectedPreparationHash:preparation.preparationHash,disclosure:testDisclosure(),feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[]},reports:[],licenses}}
const transition=(entryHash:string)=>({expectedEntryHash:entryHash,reason:'Synthetic independent lifecycle verification'})
suite('Education resource producer with real isolated PostgreSQL, source engines and product HTTP',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY||='ab'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='bc'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher/organizations/:organizationId/registrations',authenticateHuiteacher,educationAssessmentResourceRouter('TEACHER',requireRecentTeacherMfa))
  app.use('/api/campus/organizations/:organizationId/registrations',authenticateSchool,educationAssessmentResourceRouter('SCHOOL',requireRecentSchoolMfa))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server)await new Promise<void>(done=>server.close(()=>done()));await db?.$disconnect();await prisma.$disconnect()})
 it.each((['TEACHER','SCHOOL'] as const).flatMap(product=>(['COGNITIVE','SITUATIONAL','MIXED','FORM'] as const).map(kind=>({product,kind}))))('$product $kind prepares a real independent runtime, freezes once, independently reviews, publishes and retires',async({product,kind})=>{
  const f=await fixture(product,kind),p=await f.prepare()
  expect(p.runtimeCompositeId).not.toBe(f.compositeId)
  const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:p.runtimeCompositeId},include:{items:true}})
  expect(runtime).toMatchObject({productKind:'ORGANIZATION_RESOURCE',status:'DRAFT',trainingContentSnapshot:null,trainingContentSnapshotHash:null})
  expect(await db.$queryRaw`SELECT id FROM education_assessment_deliveries WHERE id=${p.resourceId}`).toEqual([])
  expect(await f.prepare()).toMatchObject({created:false,runtimeCompositeId:p.runtimeCompositeId,preparationHash:p.preparationHash})
  const registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,registration(p,f.licenses))
  expect(registered.entry.educationOrigin.distribution.actorId).toBe(f.creator.user.id)
  expect(registered.entry.educationOrigin.units).toHaveLength(f.units.length)
  await expect(service.transitionEducationAssessment(f.creator.context,p.resourceId,'REVIEW',transition(registered.entryHash))).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_INDEPENDENT_REVIEW_REQUIRED'})
  const reviewed=await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash))
  const published=await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'PUBLISH',transition(reviewed.entryHash))
  const source=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:published.version,purpose:'NEW_USE'}))
  expect(source).toMatchObject({identityOnly:true,origin:{product,organizationId:f.organizationId},runtime:{id:p.runtimeCompositeId,status:'PUBLISHED'}})
  expect(source.entry.resultDisclosure?.audiences.RESPONDENT.mode).toBe('NONE')
  expect(source.runtime.items.filter(item=>item.scaleId!==null)).toHaveLength(0)
  expect(await db.$queryRaw`SELECT id FROM registered_assessment_resources WHERE composite_id=${p.runtimeCompositeId}`).toEqual([])
  await expect(db.compositeAssessment.update({where:{id:p.runtimeCompositeId},data:{trainingContentSnapshot:{tampered:true}}})).rejects.toThrow('immutable')
  await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'RETIRE',transition(published.entryHash))
  await expect(db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:'1.0.0',purpose:'NEW_USE'}))).rejects.toThrow('NOT_AVAILABLE')
  expect(await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:'1.0.0',purpose:'HISTORY'}))).toMatchObject({identityOnly:true})
 })
 it('requires explicit target distribution, not product administrator identity, and pins the original grant against replacement',async()=>{
  const f=await fixture()
  await revokeAdminContentGrant(f.system.id,proof(),f.distribution.grantId,{expectedVersion:1,reason:'Synthetic withdrawal'})
  await expect(f.prepare()).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  expect(await db.assessmentManagementEvent.findUnique({where:{id:f.prepareInput.resourceId}})).toBeNull()
  const replacement=await f.grant(f.licenses.map(g=>g.resourceId))
  f.prepareInput.licenses=f.licenses.map(g=>({...g,grantId:replacement.grantId}))
  const p=await f.prepare(),registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,registration(p,f.prepareInput.licenses))
  await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash))
  await revokeAdminContentGrant(f.system.id,proof(),replacement.grantId,{expectedVersion:1,reason:'Synthetic frozen original grant withdrawn'})
  await f.grant(f.licenses.map(g=>g.resourceId))
  await expect(service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'PUBLISH',transition(registered.entryHash))).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
 })
 it('preserves the original creator role proof when a different later role is granted',async()=>{
  const f=await fixture(),p=await f.prepare(),registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,registration(p,f.licenses))
  await db.educationProductRoleGrant.update({where:{id:f.creator.grantId},data:{revokedAt:new Date(),revokedByUserId:f.system.id}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:f.creator.membership.id,persona:'COUNSELOR',grantedByUserId:f.system.id}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:f.creator.membership.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:f.system.id}})
  await expect(service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash))).rejects.toThrow('ORIGINAL_ISSUER_REVOKED')
 })
 it('requires target runtime/owner/audience for reports, allows explicit empty, and does not invent raw summary permission',async()=>{
  const f=await fixture(),p=await f.prepare(),unit=p.units[0]
  const noReport=registration(p,f.licenses)
  noReport.disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['mean_rt_ms'],longitudinalMetricKeys:[]}
  await expect(service.registerEducationAssessment(f.creator.context,p.resourceId,noReport)).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_DISCLOSURE_REPORT_REQUIRED'})
  const reportInput={family:'COGNITIVE',layer:'REPORT',key:'synthetic-education-report-'+randomUUID(),version:'1.0.0',scope:{kind:'PRIVATE',product:'TEACHER',ownerId:f.creator.user.id,resourceId:p.runtimeCompositeId},sourceReleaseId:null,provenance:{},assetRefs:[],
   content:{projectionVersion:1,measurements:[{releaseId:unit.measurement.releaseId,contentHash:unit.measurement.contentHash}],metricKeys:['mean_rt_ms'],audience:'teacher',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:{title:'Synthetic approved descriptive report',blocks:[{type:'METRIC',metricKey:'mean_rt_ms',display:'RAW'}]}}}
  const measurement=await db.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId))
  if(!measurement||measurement.layer!=='MEASUREMENT')throw new Error('Expected actual measurement')
  const metric=measurement.content.metrics[0].metricKey
  reportInput.content.metricKeys=[metric];reportInput.content.template.blocks[0].metricKey=metric
  for(const wrong of ['product','owner','audience'] as const){
   const raw=structuredClone(reportInput);raw.key+='-'+wrong
   if(wrong==='product')raw.scope.product='TRAINING'
   if(wrong==='owner')raw.scope.ownerId=f.reviewer.user.id
   if(wrong==='audience')raw.content.audience='student'
   const report=await db.$transaction(tx=>publishContentRelease(tx,raw,f.system.id))
   const input={...registration(p,f.licenses),reports:[{itemId:unit.itemId,releaseId:report.releaseId}]}
   await expect(service.registerEducationAssessment(f.creator.context,p.resourceId,input)).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_REPORT_SCOPE'})
  }
  const report=await db.$transaction(tx=>publishContentRelease(tx,reportInput,f.system.id))
  const grant=await f.grant([report.releaseId]),licenses=[...f.licenses,{resourceId:report.releaseId,grantId:grant.grantId}]
  const registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,{...registration(p,licenses),reports:[{itemId:unit.itemId,releaseId:report.releaseId}]})
  expect(registered.entry.educationOrigin.units[0].report).toEqual({releaseId:report.releaseId,contentHash:report.contentHash})
  await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash))
  await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'PUBLISH',transition(registered.entryHash))
  await db.$transaction(tx=>assertEducationAssessmentDistributionCurrent(tx,registered.entry.educationOrigin))
 })
 it('uses actual product cookies, current actor reads, MFA and CSRF for HTTP mutations',async()=>{
  const f=await fixture(),path=`${base}/api/huiteacher/organizations/${f.organizationId}/registrations/preparations`,csrf='synthetic-publication-csrf'
  const claims={userId:f.creator.user.id,username:f.creator.user.username,role:'TEACHER' as const,tokenVersion:0,accountDomain:'SCHOOL' as const,sessionProduct:'HUITEACHER' as const,mfaVerifiedAt:Math.floor(Date.now()/1000)}
  const request=(cookie:string,extra:Record<string,string>={})=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json',cookie,...extra},body:JSON.stringify(f.prepareInput)})
  const token=generateToken(claims),cookie=`${HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`
  expect((await request(cookie)).status).toBe(403)
  expect((await request(`${AUTH_COOKIE_NAME}=${generateToken({...claims,accountDomain:'TRAINING'})}`,{[CSRF_HEADER_NAME]:csrf})).status).toBeGreaterThanOrEqual(401)
  const schoolToken=generateToken({...claims,sessionProduct:'HUISCHOOL'})
  expect((await request(`${SCHOOL_AUTH_COOKIE_NAME}=${schoolToken}; ${SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,{[CSRF_HEADER_NAME]:csrf})).status).toBeGreaterThanOrEqual(401)
  expect((await request(`${HUITEACHER_AUTH_COOKIE_NAME}=${generateToken({...claims,mfaVerifiedAt:Math.floor(Date.now()/1000)-600})}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,{[CSRF_HEADER_NAME]:csrf})).status).toBe(403)
  const response=await request(cookie,{[CSRF_HEADER_NAME]:csrf})
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({data:{resourceId:f.prepareInput.resourceId,created:true,canPublish:false}})
 })
 it('projects only explicitly granted sources and exact approved educational C/P/R choices, and retries keep the same immutable registration',async()=>{
  const f=await fixture(),p=await f.prepare(),unit=p.units[0]
  const listed=await service.listEducationAssessmentSourceCandidates(f.creator.context)
  expect(listed.list).toEqual([expect.objectContaining({sourceCompositeId:f.compositeId,canPrepare:true,licenses:[...f.licenses].sort((a,b)=>a.resourceId.localeCompare(b.resourceId))})])
  expect(await service.listEducationAssessmentSourceCandidates(f.reviewer.context)).toEqual({list:[],nextCursor:null})
  const measurement=await db.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId))
  if(!measurement||measurement.layer!=='MEASUREMENT')throw new Error('Actual measurement missing')
  const metric=measurement.content.metrics[0].metricKey,entry=testReference().entries[0]
  Object.assign(entry,{scoreKey:metric,instrumentVersion:measurement.content.instrumentVersion,scoringVersion:measurement.content.scoringVersion})
  entry.governance!.measurementHash=measurement.content.measurementHash
  const reference=await db.$transaction(tx=>publishContentRelease(tx,{family:'COGNITIVE',layer:'REFERENCE',key:'synthetic-reference-'+randomUUID(),version:'1.0.0',
   scope:{kind:'PRIVATE',product:'TEACHER',ownerId:f.creator.user.id,resourceId:p.runtimeCompositeId},sourceReleaseId:null,assetRefs:[],provenance:{},
   content:{projectionVersion:1,measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash},entries:[{metricKey:metric,referenceKind:entry.referenceKind,definition:entry}],evidence:{method:'Synthetic theoretical range; no sample or normative claim'}}},f.system.id))
  const grant=await f.grant([reference.releaseId])
  const choices=await service.listEducationAssessmentContentChoices(f.creator.context,p.resourceId)
  expect(choices.units[0].references[0]).toMatchObject({releaseId:reference.releaseId,selectable:true,licenses:[{resourceId:reference.releaseId,grantId:grant.grantId}],choices:[{entryKey:referenceEntryKey(entry),metricKey:metric,referenceKind:'theoretical_range'}]})
  const input={...registration(p,[...f.licenses,{resourceId:reference.releaseId,grantId:grant.grantId}]),references:{schemaVersion:1,units:[{itemId:unit.itemId,choices:[{releaseId:reference.releaseId,entryKey:referenceEntryKey(entry),priority:10}]}]}}
  const registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,input)
  const missingMeasurement={...registered.entry.educationOrigin,distribution:{...registered.entry.educationOrigin.distribution,
   grants:registered.entry.educationOrigin.distribution.grants.filter(grant=>grant.resourceId!==unit.measurement.releaseId)}}
  await expect(db.$transaction(tx=>assertEducationAssessmentDistributionCurrent(tx,missingMeasurement))).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_DISTRIBUTION_SELECTION'})
  expect(await service.registerEducationAssessment(f.creator.context,p.resourceId,input)).toMatchObject({resourceId:p.resourceId,entryHash:registered.entryHash,status:'DRAFT'})
  const reviewed=await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash))
  expect(await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash))).toEqual(reviewed)
  const published=await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'PUBLISH',transition(reviewed.entryHash))
  expect(await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'PUBLISH',transition(reviewed.entryHash))).toEqual(published)
  const identity=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:'1.0.0',purpose:'NEW_USE'}))
  expect(identity.origin.units[0].references).toEqual([{releaseId:reference.releaseId,contentHash:reference.contentHash}])
  const retired=await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'RETIRE',transition(published.entryHash))
  expect(await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'RETIRE',transition(published.entryHash))).toEqual(retired)
 })
 it('requires the exact stimulus grant and actual stored asset hash, and Form bundles cannot request metrics',async()=>{
  const f=await fixture('TEACHER','FORM')
  const asset=await db.storedAsset.create({data:{objectKey:'synthetic-education-publication/'+randomUUID(),ownerId:f.system.id,mimeType:'image/png',sizeBytes:68,sha256:'d'.repeat(64)}})
  const question=formQuestionSchema.parse({itemKey:'synthetic_material',type:'SHORT_TEXT',prompt:'Synthetic Form question',required:true,
   materials:[{asset:{assetId:asset.id,contentHash:asset.sha256,mimeType:asset.mimeType},name:'Synthetic stimulus',rightsStatus:'self_authored',rightsNote:'Self-authored software fixture only'}]})
  await db.compositeAssessmentItem.updateMany({where:{compositeAssessmentId:f.compositeId},data:{formDefinition:question as Prisma.InputJsonValue}})
  await expect(f.prepare()).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_DISTRIBUTION_SELECTION'})
  const grant=await f.grant([asset.id]);f.prepareInput.licenses.push({resourceId:asset.id,grantId:grant.grantId})
  const p=await f.prepare(),invalid=registration(p,f.prepareInput.licenses)
  invalid.disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['invented'],longitudinalMetricKeys:[]}
  await expect(service.registerEducationAssessment(f.creator.context,p.resourceId,invalid)).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_DISCLOSURE_INVALID'})
  await db.storedAsset.update({where:{id:asset.id},data:{sha256:'e'.repeat(64)}})
  await expect(service.registerEducationAssessment(f.creator.context,p.resourceId,registration(p,f.prepareInput.licenses))).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_ASSET_UNAVAILABLE'})
  expect(await db.$queryRaw`SELECT id FROM education_assessment_deliveries WHERE id=${p.resourceId}`).toEqual([])
 })
 it('serializes an in-flight review behind real grant withdrawal without replacing the pinned grant',async()=>{
  const f=await fixture(),p=await f.prepare(),registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,registration(p,f.licenses))
  let reviewing:Promise<unknown>|undefined
  await db.$transaction(async tx=>{
   await tx.$queryRaw(Prisma.sql`SELECT id FROM content_capability_grants WHERE id=${f.distribution.grantId} FOR UPDATE`)
   reviewing=service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash)).then(value=>({value}),error=>({error}))
   const deadline=Date.now()+3000
   let waiting=false
   while(Date.now()<deadline){
    await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`
    const [row]=await tx.$queryRaw<Array<{waiting:boolean}>>(Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%content_capability_grants%') AS waiting`)
    if(row?.waiting){waiting=true;break}
    await new Promise(done=>setTimeout(done,10))
   }
   expect({waiting,outcome:await Promise.race([reviewing,Promise.resolve('pending')])}).toEqual({waiting:true,outcome:'pending'})
   await tx.$executeRaw(Prisma.sql`UPDATE content_capability_grants SET revoked_at=(clock_timestamp() AT TIME ZONE 'UTC'),
    revoked_by=${f.system.id},revoke_reason='Synthetic concurrent withdrawal',version=version+1 WHERE id=${f.distribution.grantId}`)
  },{timeout:6000})
  expect(await reviewing).toMatchObject({error:{code:'CONTENT_AUTHORITY_DENIED'}})
  const [row]=await db.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM education_assessment_deliveries WHERE id=${p.resourceId}`)
  expect(row.status).toBe('DRAFT')
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s registers all four real tool families in one shared Composite without a fake Scale',async product=>{
  const f=await fixture(product,'ALL_FOUR'),p=await f.prepare()
  const registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,registration(p,f.licenses))
  await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'REVIEW',transition(registered.entryHash))
  const published=await service.transitionEducationAssessment(f.reviewer.context,p.resourceId,'PUBLISH',transition(registered.entryHash))
  const actual=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:'1.0.0',purpose:'NEW_USE'}))
  expect(actual.runtime.items.map(item=>item.type)).toEqual(['COGNITIVE','SITUATIONAL','SCALE','FORM'])
  expect(actual.origin.units.map(unit=>unit.family)).toEqual(['COGNITIVE','SJT','SCALE'])
 })
 it('accepts a published pure Form source with an already frozen, genuinely empty C/P/R snapshot',async()=>{
  const f=await fixture('TEACHER','FORM'),snapshot={schemaVersion:1,compositeId:f.compositeId,units:[]}
  await db.compositeAssessment.update({where:{id:f.compositeId},data:{trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}})
  const p=await f.prepare(),registered=await service.registerEducationAssessment(f.creator.context,p.resourceId,registration(p,f.licenses))
  expect(registered.entry.educationOrigin.units).toEqual([])
  expect(registered.entry.educationOrigin.sourceSnapshotHash).toBe(canonicalHash(snapshot))
 })
})
