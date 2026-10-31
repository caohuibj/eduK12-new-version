import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {SURVEY_GONOGO_CONFIG} from '../../modules/survey/cognitive.definition'
import {publishAssignmentMeasurementRelease} from '../../modules/cognitive/assignment-measurement-release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {publishContentRelease,getContentRelease} from '../../modules/measurement-content/repository'
import {DECLARATIVE_REPORT_GENERATOR} from '../../modules/measurement-content/report-renderer'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {revokeContentAuthority} from '../../modules/measurement-content/content-authority.repository'
import {formQuestionSchema} from '../../modules/assessment-core/form/definition'
import {testReference} from '../assessment-reference/wave1-reference.fixture'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
import type {EducationAssessmentContext} from '../../modules/education-tools/assessment-resource.issuer'
import * as service from '../../modules/education-tools/assessment-resource.service'
const url=integrationDatabaseUrl('EDUCATION_MARKER_TEST_DATABASE_URL'),suite=url?describe:describe.skip
const sorted=<T extends {resourceId:string}>(rows:T[])=>[...rows].sort((a,b)=>a.resourceId.localeCompare(b.resourceId))
suite('education management exact multi-grant selection with real isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 async function fixture(withAssetGrant=true){
  const system=await db.user.create({data:{username:'license-system-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',role:'ADMIN'}})
  const organizationId=randomUUID();await db.organization.create({data:{id:organizationId,name:'Synthetic exact license selection',productDomain:'SCHOOL',createdByUserId:system.id}})
  await db.educationProductEntitlement.create({data:{organizationId,product:'HUITEACHER',grantedByUserId:system.id}})
  const user=await db.user.create({data:{username:'license-author-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}}),membershipId=randomUUID()
  await db.organizationMembership.create({data:{id:membershipId,organizationId,userId:user.id}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system.id}})
  const c:EducationAssessmentContext={product:'TEACHER',organizationId,principal:{userId:user.id,username:user.username,role:'TEACHER',platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false}}
  const config=await db.cognitiveTestConfig.upsert({where:{testType_configVersion:{testType:'gonogo',configVersion:'1.1.0'}},create:{testType:'gonogo',configVersion:'1.1.0',name:'Synthetic installed gonogo',status:'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:SURVEY_GONOGO_CONFIG},update:{}})
  const assignment=await db.cognitiveAssignment.create({data:{configId:config.id,createdBy:system.id,title:'Synthetic exact C',status:'PUBLISHED'}})
  const measurement=await db.$transaction(tx=>publishAssignmentMeasurementRelease(tx,system.id,assignment.id))
  async function asset(){return db.storedAsset.create({data:{objectKey:'synthetic-license-selection/'+randomUUID(),ownerId:system.id,mimeType:'image/png',sizeBytes:68,sha256:'d'.repeat(64)}})}
  const stimulus=await asset(),unrelated=await asset(),sourceId=randomUUID(),itemId=randomUUID(),sectionId=randomUUID()
  const question=formQuestionSchema.parse({itemKey:'synthetic_stimulus',type:'SHORT_TEXT',prompt:'Synthetic private prompt must never appear in picker DTO',required:true,materials:[{asset:{assetId:stimulus.id,contentHash:stimulus.sha256,mimeType:stimulus.mimeType},name:'Synthetic stimulus',rightsStatus:'self_authored',rightsNote:'Synthetic fixture only'}]})
  const snapshot={schemaVersion:1,compositeId:sourceId,units:[{itemId,family:'COGNITIVE',source:{kind:'COGNITIVE_CONFIG',id:config.id,ownerId:system.id,assignmentId:assignment.id},measurement}]}
  await db.compositeAssessment.create({data:{id:sourceId,code:randomUUID(),name:'Synthetic authorized source',createdBy:system.id,status:'PUBLISHED',publishedAt:new Date(),trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot),formSections:{create:{id:sectionId,title:'Synthetic material',position:1}},items:{create:[{id:itemId,type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:assignment.id},{type:'FORM',position:1,required:true,formType:'fill_blank',formLabel:question.prompt,formDefinition:question as Prisma.InputJsonValue,formSectionId:sectionId,formSectionPosition:0}]}}})
  async function grant(resourceIds:string[],requestId=randomUUID()){
   return issueAdminContentRoot(system.id,{tokenVersion:0,adminSessionId:'synthetic-proof',adminVerifiedAt:Date.now()/1000},{requestId,expectedVersion:0,reason:'Exact synthetic management selection authority',grant:{subjectId:user.id,scope:{product:'TEACHER',scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:resourceIds},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  }
  const sourceGrant=await grant([sourceId,unrelated.id],'f0000000-0000-4000-8000-'+randomUUID().slice(-12)),cGrant=await grant([measurement.releaseId])
  let assetGrant=withAssetGrant?await grant([stimulus.id]):undefined
  const licenses=()=>sorted([{resourceId:sourceId,grantId:sourceGrant.grantId},{resourceId:measurement.releaseId,grantId:cGrant.grantId},...(assetGrant?[{resourceId:stimulus.id,grantId:assetGrant.grantId}]:[])])
  const prepare=(selection=licenses())=>service.prepareEducationAssessment(c,{resourceId:randomUUID(),sourceCompositeId:sourceId,title:'Synthetic exact delivery',family:'BUNDLE',licenses:selection})
  return {system,c,measurement,sourceId,stimulus,unrelated,grant,sourceGrant,cGrant,licenses,prepare,asset,addAssetGrant:async()=>{assetGrant=await grant([stimulus.id]);return assetGrant}}
 }
 it('marks incomplete source/C/assets authority unavailable, then projects only the exact three independent grants',async()=>{
  const f=await fixture(false),missing=await service.listEducationAssessmentSourceCandidates(f.c)
  expect(missing.list).toEqual([{sourceCompositeId:f.sourceId,title:'Synthetic authorized source',canPrepare:false,canPublish:false,unavailableReason:'MISSING_DISTRIBUTION_AUTHORITY',licenses:[]}])
  await f.addAssetGrant()
  const result=await service.listEducationAssessmentSourceCandidates(f.c)
  expect(result.list).toEqual([{sourceCompositeId:f.sourceId,title:'Synthetic authorized source',canPrepare:true,canPublish:false,unavailableReason:null,licenses:f.licenses()}])
  expect(new Set(result.list[0].licenses.map(v=>v.grantId)).size).toBe(3)
  expect(JSON.stringify(result)).not.toContain('Synthetic private prompt')
  expect(JSON.stringify(result)).not.toContain(f.unrelated.id)
  await expect(f.prepare([...result.list[0].licenses,{resourceId:f.unrelated.id,grantId:f.sourceGrant.grantId}])).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_DISTRIBUTION_SELECTION'})
  expect((await f.prepare(result.list[0].licenses)).licenses).toEqual(f.licenses())
 })
 it('marks an invalid persisted source definition unavailable without exposing its source body',async()=>{
  const f=await fixture()
  await db.compositeAssessmentItem.updateMany({where:{compositeAssessmentId:f.sourceId,type:'FORM'},data:{formLabel:'Invalid label inconsistent with definition'}})
  const result=await service.listEducationAssessmentSourceCandidates(f.c)
  expect(result.list).toEqual([{sourceCompositeId:f.sourceId,title:'Synthetic authorized source',canPrepare:false,canPublish:false,unavailableReason:'SOURCE_NOT_AVAILABLE',licenses:[]}])
  expect(JSON.stringify(result)).not.toContain('Synthetic private prompt')
 })
 it('returns original preparation licenses on creation/replay/recovery and never substitutes a new grant after withdrawal',async()=>{
  const f=await fixture(),input={resourceId:randomUUID(),sourceCompositeId:f.sourceId,title:'Original proof recovery',family:'BUNDLE',licenses:f.licenses()},p=await service.prepareEducationAssessment(f.c,input)
  await f.grant([f.sourceId],'00000000-0000-4000-8000-'+randomUUID().slice(-12))
  expect((await service.listEducationAssessmentSourceCandidates(f.c)).list[0].licenses.find(v=>v.resourceId===f.sourceId)?.grantId).not.toBe(f.sourceGrant.grantId)
  expect(p.licenses).toEqual(f.licenses())
  expect((await service.prepareEducationAssessment(f.c,input)).licenses).toEqual(p.licenses)
  expect((await service.readEducationAssessmentPreparation(f.c,p.resourceId)).licenses).toEqual(p.licenses)
  await db.$transaction(tx=>revokeContentAuthority(tx,{actorId:f.system.id,grantId:f.sourceGrant.grantId,expectedVersion:1,reason:'Synthetic exact original withdrawal'}))
  await expect(service.readEducationAssessmentPreparation(f.c,p.resourceId)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  await expect(service.prepareEducationAssessment(f.c,input)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
 })
 it('projects complete P/R asset selections, pins overlapping source assets and registers without leaking unrelated grant keys',async()=>{
  const f=await fixture(),p=await f.prepare(),unit=p.units[0],extra=await f.asset(),measurement=await db.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId))
  if(!measurement||measurement.layer!=='MEASUREMENT')throw new Error('Actual C missing')
  const metric=measurement.content.metrics[0].metricKey,assetRefs=[f.stimulus,extra].map(a=>({assetId:a.id,sha256:a.sha256,mediaType:a.mimeType})),entry=testReference().entries[0]
  Object.assign(entry,{scoreKey:metric,instrumentVersion:measurement.content.instrumentVersion,scoringVersion:measurement.content.scoringVersion});entry.governance!.measurementHash=measurement.content.measurementHash
  const reference=await db.$transaction(tx=>publishContentRelease(tx,{family:'COGNITIVE',layer:'REFERENCE',key:'synthetic-license-P-'+randomUUID(),version:'1.0.0',scope:{kind:'PRIVATE',product:'TEACHER',ownerId:f.c.principal.userId,resourceId:p.runtimeCompositeId},sourceReleaseId:null,assetRefs,provenance:{},content:{projectionVersion:1,measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash},entries:[{metricKey:metric,referenceKind:entry.referenceKind,definition:entry}],evidence:{synthetic:true}}},f.system.id))
  const report=await db.$transaction(tx=>publishContentRelease(tx,{family:'COGNITIVE',layer:'REPORT',key:'synthetic-license-R-'+randomUUID(),version:'1.0.0',scope:{kind:'PRIVATE',product:'TEACHER',ownerId:f.c.principal.userId,resourceId:p.runtimeCompositeId},sourceReleaseId:null,assetRefs,provenance:{},content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],metricKeys:[metric],audience:'teacher',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:{title:'Synthetic exact report',blocks:[{type:'METRIC',metricKey:metric,display:'RAW'},{type:'ASSET',assetId:extra.id,alt:'Synthetic asset'}]}}},f.system.id))
  const pg=await f.grant([reference.releaseId]),rg=await f.grant([report.releaseId])
  await f.grant([f.stimulus.id],'00000000-0000-4000-8000-'+randomUUID().slice(-12))
  const disabled=(await service.listEducationAssessmentContentChoices(f.c,p.resourceId)).units[0]
  expect(disabled.references[0]).toMatchObject({releaseId:reference.releaseId,selectable:false,unavailableReason:'MISSING_DISTRIBUTION_AUTHORITY',licenses:[],choices:[]})
  expect(disabled.reports[0]).toMatchObject({releaseId:report.releaseId,selectable:false,unavailableReason:'MISSING_DISTRIBUTION_AUTHORITY',licenses:[],metricKeys:[]})
  const ag=await f.grant([extra.id,f.unrelated.id]),choices=(await service.listEducationAssessmentContentChoices(f.c,p.resourceId)).units[0],originalAsset=f.licenses().find(v=>v.resourceId===f.stimulus.id)!
  expect(choices.references[0]).toMatchObject({selectable:true,unavailableReason:null,licenses:sorted([{resourceId:reference.releaseId,grantId:pg.grantId},originalAsset,{resourceId:extra.id,grantId:ag.grantId}])})
  expect(choices.reports[0]).toMatchObject({selectable:true,unavailableReason:null,licenses:sorted([{resourceId:report.releaseId,grantId:rg.grantId},originalAsset,{resourceId:extra.id,grantId:ag.grantId}])})
  const licenses=sorted([...new Map([...p.licenses,...choices.references[0].licenses,...choices.reports[0].licenses].map(v=>[v.resourceId,v])).values()])
  expect(licenses).toHaveLength(6);expect(licenses.some(v=>v.resourceId===f.unrelated.id)).toBe(false)
  const input={expectedPreparationHash:p.preparationHash,disclosure:testDisclosure(),feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[{itemId:unit.itemId,choices:[{releaseId:reference.releaseId,entryKey:referenceEntryKey(entry),priority:0}]}]},reports:[{itemId:unit.itemId,releaseId:report.releaseId}],licenses}
  await expect(service.registerEducationAssessment(f.c,p.resourceId,{...input,licenses:[...licenses,{resourceId:f.unrelated.id,grantId:ag.grantId}]})).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_DISTRIBUTION_SELECTION'})
  const registered=await service.registerEducationAssessment(f.c,p.resourceId,input)
  expect(registered.entry.educationOrigin.distribution.grants.map(({resourceId,grantId})=>({resourceId,grantId}))).toEqual(licenses)
 })
 it('paginates 51 authorized sources and 51 report versions without dropping the last item or widening authority',async()=>{
  const f=await fixture(),ids:string[]=[]
  for(let i=0;i<50;i++){
   const id=randomUUID(),sectionId=randomUUID(),snapshot={schemaVersion:1,compositeId:id,units:[]}
   await db.compositeAssessment.create({data:{id,code:randomUUID(),name:'Synthetic paged source '+i,createdBy:f.system.id,status:'PUBLISHED',publishedAt:new Date(),trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot),formSections:{create:{id:sectionId,title:'Page',position:0}},items:{create:{type:'FORM',position:0,required:true,formType:'SHORT_TEXT',formLabel:'Synthetic',formDefinition:formQuestionSchema.parse({itemKey:'note',type:'SHORT_TEXT',prompt:'Synthetic',required:true,options:[],rows:[],maxLength:100}) as Prisma.InputJsonValue,formSectionId:sectionId,formSectionPosition:0}}}})
   ids.push(id)
  }
  await f.grant(ids)
  const first=await service.listEducationAssessmentSourceCandidates(f.c)
  expect(first.list).toHaveLength(50);expect(first.nextCursor).not.toBeNull()
  const second=await service.listEducationAssessmentSourceCandidates(f.c,first.nextCursor!)
  expect(second.list).toHaveLength(1);expect(second.nextCursor).toBeNull()
  expect([...first.list,...second.list].map(x=>x.sourceCompositeId).sort()).toEqual([...ids,f.sourceId].sort())
  expect(new Set([...first.list,...second.list].map(x=>x.sourceCompositeId)).size).toBe(51)
  await expect(service.listEducationAssessmentSourceCandidates({...f.c,organizationId:randomUUID()},first.nextCursor!)).rejects.toThrow()
  await expect(service.listEducationAssessmentSourceCandidates(f.c,'not-a-cursor')).rejects.toThrow()
  const preparation=await f.prepare(),measurement=await db.$transaction(tx=>getContentRelease(tx,f.measurement.releaseId))
  if(!measurement||measurement.layer!=='MEASUREMENT')throw Error('Missing C')
  const metric=measurement.content.metrics[0].metricKey,reportIds:string[]=[]
  for(let i=0;i<51;i++){
   const report=await db.$transaction(tx=>publishContentRelease(tx,{family:'COGNITIVE',layer:'REPORT',key:'synthetic-page-R-'+randomUUID(),version:'1.0.0',scope:{kind:'PRIVATE',product:'TEACHER',ownerId:f.c.principal.userId,resourceId:preparation.runtimeCompositeId},sourceReleaseId:null,assetRefs:[],provenance:{},content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],metricKeys:[metric],audience:'teacher',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:{title:'Synthetic report '+i,blocks:[{type:'METRIC',metricKey:metric,display:'RAW'}]}}},f.system.id));reportIds.push(report.releaseId)
  }
  const grant=await f.grant(reportIds),p1=await service.listEducationAssessmentContentChoices(f.c,preparation.resourceId)
  expect(p1.units[0].reports).toHaveLength(50);expect(p1.nextCursor).not.toBeNull()
  const p2=await service.listEducationAssessmentContentChoices(f.c,preparation.resourceId,p1.nextCursor!)
  expect(p2.units[0].reports).toHaveLength(1);expect(p2.nextCursor).toBeNull()
  expect([...p1.units[0].reports,...p2.units[0].reports].map(x=>x.releaseId).sort()).toEqual(reportIds.sort())
  await db.$transaction(tx=>revokeContentAuthority(tx,{actorId:f.system.id,grantId:grant.grantId,expectedVersion:1,reason:'Synthetic page withdrawal'}))
  const withdrawn=await service.listEducationAssessmentContentChoices(f.c,preparation.resourceId,p1.nextCursor!)
  expect(withdrawn.units[0].reports).toEqual([]);expect(withdrawn.nextCursor).toBeNull()
 },60000)
})
