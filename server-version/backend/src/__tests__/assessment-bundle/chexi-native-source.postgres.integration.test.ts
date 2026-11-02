import fs from 'node:fs'
import path from 'node:path'
import {createHmac,randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {prisma as db} from '../../config/database'
import {config} from '../../config'
import {createChexiZhHansSource} from '../../modules/scale/packages/chexi-zh-hans-v1'
import {parseScaleInstrumentSourceSchema} from '../../modules/scale/onboarding/schema'
import {createScaleInstrumentRegistry} from '../../modules/scale/onboarding/instrument-registry'
import {materializeScaleInstrumentContent} from '../../modules/scale/onboarding/materialize'
import {createComponentDraft} from '../../modules/scale/component-import/service'
import {emptyReport} from '../../modules/scale/component-import/contract'
import {previewComponentPublication,publishComponentDraft} from '../../modules/scale/component-import/publication'
import {standardReleaseRow} from '../../modules/survey/standard-triplet.service'
import {databaseContentSource} from '../../modules/scale/component-import/native-source'
import {changeEntryGrant} from '../../modules/admin-permissions/service'
import {grantTrainingStandardCombinationUse,revokeTrainingStandardCombinationUse} from '../../modules/measurement-content/standard-combination-use'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {parseDeclarativePackage,type DeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {installPackage,publishPackage} from '../../modules/bundle-product/package-release'
import {bundleDefinitionProvider,bundleProductService as product} from '../../modules/bundle-product/service'
import {createChildCrossMethodService} from '../../modules/bundle-product/child-cross-method'
import {createGrant,deleteGrant} from '../../services/materialGrant'
import {canonicalHash,canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {cognitiveSeeds} from '../../modules/cognitive/generated/seeds'
import {publishCognitiveConfig} from '../../modules/cognitive/release.service'
import {createAssignment,publishAssignment} from '../../modules/cognitive/assignment.service'
import {getAttemptState,finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {submitCognitiveSessionFinal} from '../../modules/cognitive/final-submit.service'
import {gonogoSequence,flankerSequence} from '../../modules/cognitive/randomization'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'

// Opt-in dedicated disposable DB only. Public CI uses synthetic item text;
// a private local source file may exercise identical code with licensed text.
const url=process.env.CHEXI_NATIVE_SOURCE_TEST_DATABASE_URL?.trim(),suite=url?describe:describe.skip
const root=path.resolve(__dirname,'../../modules/assessment-bundle/packages')
const keys=['child_chexi_parent_zh_cn_v1','child_chexi_teacher_zh_cn_v1','child_cognitive_control_parent_zh_cn','child_cognitive_control_teacher_zh_cn','child_cognitive_control_parent_teacher_zh_cn']
const evidence:any={productionAccessed:false,sourceMode:process.env.CHEXI_PRIVATE_SOURCE_FILE?'PRIVATE_SOURCE':'SYNTHETIC_PUBLIC_FIXTURE',
 authority:'Actual application grant/publication services with isolated synthetic principals and trusted-session fixtures; no direct grant inserts',humanReviewClaimed:false,httpOrMfaCeremony:false,steps:[]}
let system:any,reviewer:any,issuer:any,teacher:any,child:any,parent:any,course:any,source:any,oldRow:any,oldHash:string,native:any,use:any,release:any
const packs:DeclarativePackage[]=[],templates:string[]=[],actor:any={role:'TEACHER'}
const service=createChildCrossMethodService(db)
const originalCognitive=config.cognitiveModuleEnabled,originalGrants=config.materialGrantsEnabled
const readSource=()=>{
 if(process.env.CHEXI_PRIVATE_SOURCE_FILE)return parseScaleInstrumentSourceSchema(JSON.parse(fs.readFileSync(process.env.CHEXI_PRIVATE_SOURCE_FILE,'utf8')))
 const value=createChexiZhHansSource({instruction:'Synthetic observer instruction only',items:Array.from({length:24},(_,i)=>`Synthetic observation ${i+1}`)})
 value.identity={...value.identity,instrumentVersion:'1.0.1'}
 value.localization={...value.localization!,localizationVersion:'1.0.1'}
 return parseScaleInstrumentSourceSchema(value)
}
async function installAndPublish(pack:DeclarativePackage){
 bundleDefinitionProvider.register(packageEntry(pack))
 const row=await installPackage(db,system.id,pack)
 const material={contentHash:row.contentHash,reviewerId:reviewer.id,expiresAt:new Date(Date.now()+86400000).toISOString(),claims:['independent_summary','cross_source_condition','joint_conclusion'],scientific:true,rights:true,language:true,report:true}
 const signature=createHmac('sha256',process.env.BUNDLE_REVIEW_SIGNING_KEY!).update(canonicalJsonString(material)).digest('hex')
 await publishPackage(db,reviewer.id,pack.manifest.definition.bundleKey,pack.manifest.definition.bundleVersion,{...material,signature})
 await createGrant({teacherId:teacher.id,resourceType:'ASSESSMENT_BUNDLE',resourceId:pack.manifest.definition.bundleKey+'@'+pack.manifest.definition.bundleVersion,grantedBy:system.id})
}
suite('CHEXI native append and exact Bundle composition without registry publication mocks',{timeout:180000},()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  config.cognitiveModuleEnabled=true;config.materialGrantsEnabled=true
  process.env.BUNDLE_PRODUCTS_ENABLED='true'
  process.env.DATA_ENCRYPTION_KEY='a1'.repeat(32);process.env.DATA_PSEUDONYM_KEY='b2'.repeat(32)
  process.env.BUNDLE_REVIEW_SIGNING_KEY='isolated-bundle-review-fixture-not-production'
  const user=async(name:string,role:any,platformRole:any='STANDARD')=>db.user.create({data:{username:'chexi-native-'+name+'-'+randomUUID(),passwordHash:'synthetic-unused',role,platformRole,accountDomain:'TRAINING',teacherApproved:role==='TEACHER',mustChangePassword:false}})
  system=await user('system','ADMIN','SYSTEM_ADMIN');reviewer=await user('reviewer','ADMIN','SYSTEM_ADMIN');issuer=await user('issuer','ADMIN')
  teacher=await user('teacher','TEACHER');child=await user('child','STUDENT');parent=await user('parent','PARENT');actor.userId=teacher.id
  await changeEntryGrant({actorUserId:system.id,targetUserId:issuer.id,entry:'TRAINING',active:true,expectedVersion:0,reason:'Isolated CHEXI exact-use issuer',actorSession:{tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}})
  course=await db.course.create({data:{creatorId:teacher.id,title:'Isolated CHEXI native course',courseCode:'chexi-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:child.id,status:'ACTIVE'}})
  await db.parentStudentRelationship.create({data:{parentUserId:parent.id,studentUserId:child.id,status:'ACTIVE',approvedByUserId:teacher.id,approvedAt:new Date()}})
  source=readSource();expect(source.identity).toEqual({instrumentKey:'chexi_zh_hans',instrumentVersion:'1.0.1'})
  expect(source.executable.releaseStatus).toBe('DRAFT')
  const old=createChexiZhHansSource({instruction:'Historical synthetic DRAFT only',items:Array.from({length:24},(_,i)=>`Historical synthetic item ${i+1}`)})
  oldRow=(await materializeScaleInstrumentContent(db,{...old.identity,actorUserId:system.id},createScaleInstrumentRegistry([old]))).scale
  oldHash=canonicalHash(JSON.parse(JSON.stringify(oldRow)))
  const d=source.executable.definition
  const metadata={title:source.catalog.identity.canonicalName,...Object.fromEntries(['instruction','applicability','disclosure','catalog','localization','usageRequirements','educationApplicability','educationExpertApplicability','educationalFeedback'].filter(k=>source[k]!==undefined).map(k=>[k,source[k]]))}
  const draft=await createComponentDraft(system.id,{requestId:randomUUID(),draft:{toolKey:source.identity.instrumentKey,configurationName:'Official baseline CHEXI 1.0.1',baseCombination:null,changedParts:{
   CONTENT:{version:'1.0.1',definition:{...d,report:emptyReport(d.scoring.scores),referencePolicy:{type:'none'}},metadata},
   PARAMETERS:{version:'none-v1',payload:{referencePolicy:d.referencePolicy,references:source.executable.references}},REPORT:{version:'1.0.0',payload:d.report}}}})
  const preview=await previewComponentPublication(system.id,draft.id);expect(preview.blockers).toEqual([])
  const published=await publishComponentDraft(system.id,draft.id,{requestId:randomUUID(),expectedRevision:preview.revision,expectedPreviewHash:preview.previewHash,expectedBase:null,allowedProducts:['TRAINING'],reason:'Isolated application publication and real trial of the private source'})
  expect(published.state).toBe('ONLINE');release=await standardReleaseRow(db,published.id)
  native=await db.scale.findUniqueOrThrow({where:{id:databaseContentSource(release.snapshot.parts.CONTENT)!.scaleId}})
  expect(native.id).not.toBe(oldRow.id);expect(native.instrumentVersion).toBe('1.0.1');expect(native.status).toBe('PUBLISHED')
  expect(canonicalHash(JSON.parse(JSON.stringify(await db.scale.findUniqueOrThrow({where:{id:oldRow.id}}))))).toBe(oldHash)
  evidence.steps.push({stage:'append',oldScalePreserved:true,newNativeStatus:native.status,sourceReleaseState:published.state,sourceFileStatus:source.executable.releaseStatus,scoringVersion:d.scoring.scoringVersion,reportVersion:d.report.reportVersion})
  for(const testType of ['gonogo','flanker']){
   const seed=cognitiveSeeds.find(s=>s.testType===testType&&s.configVersion==='1.0.0')!
   let row=await db.cognitiveTestConfig.findUnique({where:{testType_configVersion:{testType,configVersion:'1.0.0'}}})
   if(!row)row=await db.cognitiveTestConfig.create({data:{...seed,config:seed.config as any,status:'DRAFT',accessPolicy:'OPEN'}})
   if(row.status==='DRAFT')await publishCognitiveConfig(row.id,system.id)
   else expect(row.status).toBe('PUBLISHED')
  }
  for(const key of keys){
   const p=loadPackage(root+'/'+key+'/0.1.0');p.manifest.definition.bundleVersion='0.1.1'
   const slots=p.manifest.definition.slots.filter(s=>s.unitType==='SCALE');for(const slot of slots)slot.instrumentVersion='1.0.1'
   p.manifest.scaleDependencies=slots.map(slot=>({slotKey:slot.slotKey,releaseId:release.id,combinationHash:release.combination_hash,source}))
   packs.push(parseDeclarativePackage(p));await installAndPublish(packs.at(-1)!)
  }
  const tasks=loadPackage(root+'/child_cognitive_tasks_zh_cn/0.1.0');await installAndPublish(tasks)
  const taskBindings=[]
  for(const testType of ['gonogo','flanker']){
   const cfg=await db.cognitiveTestConfig.findUniqueOrThrow({where:{testType_configVersion:{testType,configVersion:'1.0.0'}}})
   const assignment=await createAssignment(teacher.id,'TEACHER',{configId:cfg.id,courseId:course.id,title:'Isolated '+testType,profile:'standard',instruction:null,maxAttempts:10,required:true} as any)
   const pub=await publishAssignment(teacher.id,'TEACHER',assignment.id);taskBindings.push({slotKey:testType,resourceId:pub.id})
  }
  const task=await product.create(actor,{requestId:randomUUID(),bundleKey:'child_cognitive_tasks_zh_cn',bundleVersion:'0.1.0',name:'Isolated child tasks',courseId:course.id,bindings:taskBindings})
  templates.push((await product.publish(actor,task.id,task.revision)).id)
  evidence.steps.push({stage:'package-publication',publishedBundles:packs.length,exactPinsSigned:true,directGrantInserts:0})
 },180000)
 afterAll(async()=>{
  config.cognitiveModuleEnabled=originalCognitive;config.materialGrantsEnabled=originalGrants
  if(process.env.CHEXI_NATIVE_EVIDENCE_FILE)fs.writeFileSync(process.env.CHEXI_NATIVE_EVIDENCE_FILE,JSON.stringify(evidence,null,2)+'\n')
  await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()
 })
 it('uses actual grant issuance, independent observers, frozen canonical identities and saved reports',async()=>{
  const createObserver=(index:number,scaleId=native.id)=>product.create(actor,{requestId:randomUUID(),bundleKey:keys[index],bundleVersion:'0.1.1',name:'Isolated observer '+index,courseId:course.id,bindings:[{slotKey:'chexi',resourceId:scaleId}]})
  const before=await db.compositeAssessment.count()
  await expect(createObserver(0)).rejects.toThrow()
  expect(await db.compositeAssessment.count()).toBe(before)
  use=await grantTrainingStandardCombinationUse(issuer.id,release.id,{requestId:randomUUID(),userId:teacher.id,combinationHash:release.combination_hash})
  await expect(createObserver(0,oldRow.id)).rejects.toThrow('NATIVE_VERSION_UNAVAILABLE')
  // Hold the actual native row after the first U check. The real issuer then
  // expires while waiting, and a real Bundle grant deletion must wait for the
  // protected transaction rather than racing its previously observed grant.
  const bundleGrant=await db.materialGrant.findUniqueOrThrow({where:{teacherId_resourceType_resourceId:{teacherId:teacher.id,resourceType:'ASSESSMENT_BUNDLE',resourceId:keys[0]+'@0.1.1'}}})
  let locked!:()=>void,unlock!:()=>void
  const ready=new Promise<void>(resolve=>{locked=resolve}),hold=new Promise<void>(resolve=>{unlock=resolve})
  const holder=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM scales WHERE id=${native.id} FOR UPDATE`;locked();await hold},{timeout:10000})
  await ready
  const deadline=new Date(Date.now()+2000)
  await db.user.update({where:{id:issuer.id},data:{expiresAt:deadline}})
  const count=await db.compositeAssessment.count()
  const waiting=createObserver(0).then(value=>({value,error:null as unknown}),error=>({value:null,error}))
  let deleting:Promise<unknown>|undefined,deleted=false
  try{
   let reached=false
   for(let i=0;i<25;i++){
    const rows=await db.$queryRaw<Array<{query:string}>>`SELECT query FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM scales WHERE id=%FOR SHARE%'`
    if(rows.length){reached=true;break}await new Promise(resolve=>setTimeout(resolve,30))
   }
   expect(reached).toBe(true)
   deleting=deleteGrant(bundleGrant.id).then(value=>{deleted=true;return value})
   await new Promise(resolve=>setTimeout(resolve,60));expect(deleted).toBe(false)
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,deadline.getTime()-Date.now()+80)))
  }finally{unlock();await holder}
  const outcome=await waiting;expect(outcome.error).toBeTruthy();expect(outcome.value).toBeNull()
  await deleting
  expect(await db.compositeAssessment.count()).toBe(count)
  await db.user.update({where:{id:issuer.id},data:{expiresAt:null}})
  await createGrant({teacherId:teacher.id,resourceType:'ASSESSMENT_BUNDLE',resourceId:keys[0]+'@0.1.1',grantedBy:system.id})
  evidence.steps.push({stage:'lock-wait-controls',expiredIssuerDenied:true,bundleGrantDeletionWaited:true,partialDraftRolledBack:true,grantRestoredThroughService:true})
  for(let i=0;i<2;i++){const draft=await createObserver(i);templates.push((await product.publish(actor,draft.id,draft.revision)).id)}
  const input={requestId:randomUUID(),subjectUserId:child.id,taskCompositeId:templates[0],parent:{userId:parent.id,compositeId:templates[1]},teacherObserverCompositeId:templates[2],reportBundleKey:keys[4],reportBundleVersion:'0.1.1'}
  const issued=await service.issue(actor,input)
  const parentAssignment=issued.assignments.find((a:any)=>a.respondentType==='PARENT')!
  await expect(service.start({userId:parent.id,role:'PARENT'},parentAssignment.assignmentId)).rejects.toThrow()
  await service.accept({userId:parent.id,role:'PARENT'},parentAssignment.assignmentId)
  const entered:Array<{assignment:any;who:any;started:any}>=[]
  for(const assignment of issued.assignments){
   const who={userId:assignment.respondentUserId,role:assignment.respondentType==='SELF'?'STUDENT':assignment.respondentType}
   evidence.steps.push({stage:'start-request',respondentType:assignment.respondentType})
   const started=await service.start(who,assignment.assignmentId)
   evidence.steps.push({stage:'start-passed',respondentType:assignment.respondentType})
   entered.push({assignment,who,started})
  }
  const grant=await db.materialGrant.findFirstOrThrow({where:{teacherId:teacher.id,resourceType:'STANDARD_COMBINATION',resourceId:release.id,revokedAt:null}})
  await revokeTrainingStandardCombinationUse(issuer.id,grant.id,{expectedVersion:grant.version,reason:'Isolated withdrawal after START and before first Scale activation'})
  await expect(service.issue(actor,{...input,requestId:randomUUID()})).rejects.toThrow()
  evidence.steps.push({stage:'withdraw-after-start',enteredObservers:2,newRoundDenied:true,sourceUseVersion:grant.version})
  for(const {assignment,who,started} of entered){
   let state=await getAttemptState(started.attemptId,{userId:who.userId}),unit=state.currentItem as any
   if(unit?.type==='FORM_SECTION')await submitCompositeFormSectionFinal({attemptId:started.attemptId,sectionId:unit.formSectionId,userId:who.userId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.definitionHash,answers:unit.answers.map((q:any)=>({formItemId:q.formItemId,value:'2018-01'}))})
   for(let i=0;i<3;i++){
    state=await getAttemptState(started.attemptId,{userId:who.userId});unit=state.currentItem as any
    if(state.status==='COMPLETED'||!unit)break
    if(unit.type==='SCALE'){
     await submitScaleAssessmentFinal({assessmentId:unit.scaleAssessmentId,userId:who.userId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:unit.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:assignment.respondentType==='PARENT'?2:4}))})
    }else{
     const session=await db.cognitiveSession.findUniqueOrThrow({where:{id:unit.cognitiveSession.sessionId},include:{assignment:true}})
     const trials=session.testType==='gonogo'?gonogoSequence(session.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}})):flankerSequence(session.randomSeed,80).map((spec,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*2200,endedAtPerfMs:trialIndex*2200+500,payload:{targetDirection:spec.targetDirection,flankerDirection:spec.flankerDirection,response:spec.correctResponse,rtMs:spec.targetDirection===spec.flankerDirection?500:488,interrupted:false,timedOut:false}}))
     await submitCognitiveSessionFinal(who.userId,{sessionId:session.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:session.assignment!.resolvedConfigHash!,contextSnapshotHash:state.contextSnapshotHash,trials})
    }
   }
   await finalizeCompositeAttemptIfReady(started.attemptId)
   expect(await db.compositeAssessmentAttempt.findUnique({where:{id:started.attemptId}})).toMatchObject({status:'COMPLETED',subjectUserId:child.id,respondentUserId:who.userId})
   if(assignment.respondentType!=='SELF')expect(await service.sourceReport(who,assignment.assignmentId)).toMatchObject({status:'READY'})
  }
  const result:any=await service.collect(actor,issued.episodeId,randomUUID())
  expect(result.status).toBe('READY')
  expect(result.view.evidence.find((e:any)=>e.evidenceKey==='parent_chexi_working_memory').value.value).toBe(2)
  expect(result.view.evidence.find((e:any)=>e.evidenceKey==='teacher_chexi_working_memory').value.value).toBe(4)
  await expect(service.collect({userId:parent.id,role:'PARENT'},issued.episodeId,randomUUID())).rejects.toThrow()
  evidence.steps.push({stage:'actual-runtime',observers:2,parentMean:2,teacherMean:4,averagedObservers:false,jointReport:result.status})
  expect(await service.sourceReport({userId:parent.id,role:'PARENT'},parentAssignment.assignmentId)).toMatchObject({status:'READY'})
  expect(canonicalHash(JSON.parse(JSON.stringify(await db.scale.findUniqueOrThrow({where:{id:oldRow.id}}))))).toBe(oldHash)
  evidence.steps.push({stage:'withdrawal-and-history',newRoundDenied:true,ownSavedReportReadable:true,oldVersionUnchanged:true})
 })
})
