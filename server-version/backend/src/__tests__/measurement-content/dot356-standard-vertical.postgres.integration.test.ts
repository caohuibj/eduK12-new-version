/**
 * HOST-ONLY OPT-IN. First apply migrations to an EMPTY dedicated DB. No seeds.
 * Required: NODE_ENV=test DOT356_STANDARD_VERTICAL=1
 * DATABASE_URL=postgresql://<private credentials>@127.0.0.1:55439/eduk12_dot356_vertical_20261025
 * ADMIN_AUTH_ORIGIN=http://localhost:5173 ASSESSMENT_REPORT_ASYNC_ENABLED=false
 * DATA_ENCRYPTION_KEY=<64 hex test key>; JWT_SECRET=<test-only secret>.
 * Set the normal isolated Redis configuration if this checkout requires Redis.
 * Optional PERF_ISOLATED_TEST_MODE=1 PERF_SQL_EVENT_COUNT=1 records counts/duration,
 * never SQL parameters, cookies, tokens, answers, report text or private config.
 * DOT356_VERTICAL_OUTPUT chooses summary path (default /tmp). Parent directory must exist.
 * Run: npx vitest run src/__tests__/measurement-content/dot356-standard-vertical.postgres.integration.test.ts
 * Failed runs retain immutable evidence. Re-provision the dedicated DB before a new run;
 * this driver never drops data or resets application lifecycle status.
 */
import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {describe,it,expect,beforeAll,afterAll} from 'vitest'
const enabled=process.env.DOT356_STANDARD_VERTICAL==='1',suite=enabled?describe:describe.skip
// Explicit continuation runs only the previously failed authority case against
// retained synthetic ONLINE facts; it never counts the skipped main flow as new.
const authorityContinuation=process.env.DOT356_STANDARD_AUTHORITY_CONTINUE==='1'
const receiptContinuation=process.env.DOT356_STANDARD_RECEIPT_CONTINUE==='1'
const KEY='academic_self_concept_biology_zh_cn',VERSION='1.0.0'
/** Fence runs before importing any application module. No acceptance DB access. */
export function assertDot356VerticalIsolation(){
 const u=new URL(process.env.DATABASE_URL??'invalid:')
 if(process.env.NODE_ENV!=='test'||!enabled||!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='55439'
  ||(!['/eduk12_dot356_vertical_20261025','/eduk12_dot356_vertical_20261025_v2'].includes(u.pathname)&&!/^\/eduk12_dot356_vertical_\d{8}_[a-f0-9]{10}$/.test(u.pathname))||u.searchParams.has('host')||u.searchParams.has('schema'))throw new Error('Dedicated dot356 vertical DB and explicit opt-in required')
 if(process.env.ADMIN_AUTH_ORIGIN!=='http://localhost:5173')throw new Error('Explicit test origin http://localhost:5173 required')
 if(process.env.ASSESSMENT_REPORT_ASYNC_ENABLED!=='false')throw new Error('Bounded vertical test requires the real synchronous report path')
}
suite('dot356 registered source to real ONLINE and Training FINAL',()=>{
 let db:any,server:Server|undefined,base='',system:any,issuer:any,teacher:any,student:any,outsider:any,generateToken:any,stage='setup'
 const events:any[]=[],summary:any={sourceKey:KEY,sourceVersion:VERSION,status:'NOT_RUN',observation:'single cold synthetic run; table access is not proven redundancy'}
 let completedCases=0
 const startedAt=performance.now(),cpuStart=process.cpuUsage(),memoryStart=process.memoryUsage()
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 async function request(user:any,path:string,body?:unknown,expected=200){
  const token=generateToken({userId:user.id,username:user.username,role:user.role,accountDomain:'TRAINING',tokenVersion:user.tokenVersion,...proof})
  const method=body===undefined?'GET':'POST'
  const response=await fetch(base+path,{method,headers:{Cookie:'ptool_session='+token+'; ptool_csrf=dot356-test-csrf','X-CSRF-Token':'dot356-test-csrf',Origin:process.env.ADMIN_AUTH_ORIGIN!,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  events.push({stage,method,path,status:response.status})
  const payload:any=await response.json()
  expect(response.status,`${stage}: ${method} ${path}: ${payload.message??payload.code??'HTTP failure'}`).toBe(expected)
  return payload.data
 }
 beforeAll(async()=>{
  assertDot356VerticalIsolation();db=(await import('../../config/database')).prisma;
  if(process.env.PERF_ISOLATED_TEST_MODE==='1'&&process.env.PERF_SQL_EVENT_COUNT==='1')db.$on('query',(q:any)=>{
   const counts=summary.sqlCounts??(summary.sqlCounts={});const v=counts[stage]??(counts[stage]={count:0,durationMs:0,tableAccess:{}});v.count++;v.durationMs+=q.duration
   // Categories may overlap. Direct table mentions are not proof of redundant work.
   const categories:Record<string,RegExp>={qualification_users:/\b(users|admin_entry_grants|scientific_qualifications)\b/i,tool_grants_capabilities:/\b(material_grants|content_capability_grants|scale_library_use_grants|organization_capability_grants|sjt_release_grants)\b/i,third_party_license:/\binstrument_authorizations\b/i,version_deployment:/\b(scales|scale_deployment_policies|measurement_content_releases|measurement_content_release_events|survey_standard_releases)\b/i,answers_results_reports:/\b(assessments|assessment_result_facts|assessment_unit_snapshots|composite_assessment_attempts|composite_report_jobs|assessment_completion_outbox)\b/i,transaction_control:/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|SET TRANSACTION)\b/i}
   let matched=false;for(const [name,pattern]of Object.entries(categories))if(pattern.test(q.query)){v.tableAccess[name]=(v.tableAccess[name]??0)+1;matched=true}
   if(!matched)v.tableAccess.other=(v.tableAccess.other??0)+1
  })
  generateToken=(await import('../../utils/jwt')).generateToken
  if(authorityContinuation||receiptContinuation){
   const users=await db.user.findMany();if(users.length!==5)throw new Error('Continuation requires the retained five-user synthetic fixture')
   const exact=(name:string)=>{const matches=users.filter((u:any)=>u.username.startsWith('dot356-'+name+'-'));if(matches.length!==1)throw new Error('Missing unique retained fixture actor');return matches[0]}
   system=exact('system');issuer=exact('issuer');teacher=exact('teacher');student=exact('student');outsider=exact('outsider')
   const rows=await db.$queryRaw`SELECT id,combination_hash FROM survey_standard_releases WHERE tool_key=${KEY} AND state='ONLINE'`
   if(rows.length!==1||system.platformRole!=='SYSTEM_ADMIN'||teacher.role!=='TEACHER')throw new Error('Retained synthetic ONLINE fixture required')
   summary.combination={releaseId:rows[0].id,combinationHash:rows[0].combination_hash}
   summary.scope='Authority continuation only; main flow and constraints are not reexecuted or requalified here'
  }else{
   if(await db.user.count()!==0||await db.scale.count()!==0)throw new Error('Fresh schema-only DB required; do not reuse a previous attempt')
   const create=(name:string,role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{username:'dot356-'+name+'-'+randomUUID(),passwordHash:'SYNTHETIC TEST ONLY',role,platformRole,accountDomain:'TRAINING',teacherApproved:role==='TEACHER'}})
   system=await create('system','STUDENT','SYSTEM_ADMIN');issuer=await create('issuer');teacher=await create('teacher','TEACHER');student=await create('student');outsider=await create('outsider')
   await db.adminEntryGrant.create({data:{id:randomUUID(),userId:issuer.id,entry:'TRAINING',grantedBy:system.id}})
  }
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard)
  app.use('/api/platform/survey-standard',(await import('../../modules/survey/standard-triplet.routes')).surveyStandardTripletRouter)
  app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  summary.status=completedCases===(authorityContinuation||receiptContinuation?1:4)?'PASS':'FAIL';summary.passedCases=completedCases
  summary.lastStage=stage;summary.http=events
  summary.processObservation={elapsedMs:performance.now()-startedAt,cpuMicroseconds:process.cpuUsage(cpuStart),memoryStart,memoryEnd:process.memoryUsage(),maxRssKiB:process.resourceUsage().maxRSS,scope:'whole test process, not per-request performance'}
  await writeFile(process.env.DOT356_VERTICAL_OUTPUT??'/tmp/dot356-standard-vertical-result.json',JSON.stringify(summary,null,2),{mode:0o600})
  if(server)await new Promise<void>(r=>server!.close(()=>r()))
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.skipIf(authorityContinuation||receiptContinuation)('real installation, three trials, exact 21B, teacher publish, child FINAL, authorized reload and P/R',async()=>{
  summary.status='IN_PROGRESS';stage='install-hidden-publish'
  const registry=await import('../../modules/scale/onboarding/instrument-registry')
  const onboarding=await import('../../modules/scale/onboarding/install'),publication=await import('../../modules/scale/onboarding/publish')
  const source=registry.getScaleInstrumentSource(KEY,VERSION)!,runtime=registry.getScaleInstrumentRuntimePolicy(KEY,VERSION)!
  const install={instrumentKey:KEY,instrumentVersion:VERSION,actorUserId:system.id,deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',
   deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'] as Array<'STANDALONE'|'COMPOSITE'|'QUESTIONNAIRE'>,
   runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:VERSION,inFlightCompletion:'FROZEN_DEADLINE' as const}}
  expect((await onboarding.planScaleInstrumentInstall(db,install)).blockers).toEqual([])
  const installed=await onboarding.installScaleInstrument(db,install);expect(installed.scaleId).toBeTruthy()
  const pub={instrumentKey:KEY,instrumentVersion:VERSION,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['SURVEY' as const]}
  const pp=await publication.planStandardScalePublication(db,pub);expect(pp.blockers).toEqual([])
  await publication.publishStandardScale(db,{...pub,expectedProofHash:pp.proofHash})
  // User decision: native Scale and exact C/P/R combination have independent
  // entry approval, as in Survey. The generic source cannot enter Training;
  // the TRAINING-approved combination below must still complete its real flow.
  const nativeGuard=(await import('../../modules/scale/scale-collection-guard')).assertTrainingScaleCollectionAllowed
  await expect(db.$transaction((tx:any)=>nativeGuard(tx,[installed.scaleId]))).rejects.toThrow('该精确版本未获本入口准入')
  summary.entryAdmission={nativeScale:['SURVEY'],exactCombination:['TRAINING'],nativeTrainingRejected:true}
  stage='real-three-trial-approval'
  const candidate=await request(system,`/api/platform/survey-standard/candidate/${KEY}/${VERSION}`)
  const preview=await request(system,'/api/platform/survey-standard/preview',candidate.selection)
  const approve={...candidate.selection,expectedCombinationHash:preview.combinationHash,requestId:randomUUID(),reason:'Dedicated dot356 synthetic vertical test',allowedProducts:['TRAINING']}
  const online=await request(system,'/api/platform/survey-standard/approve',approve);expect(online.state).toBe('ONLINE')
  const pointer={releaseId:online.id,combinationHash:online.combinationHash}
  const trials=await db.$queryRaw`SELECT id,report,scores FROM survey_standard_trials WHERE release_id=${online.id}`
  expect(trials).toHaveLength(3);for(const t of trials){expect(t.report.blocks.length).toBeGreaterThan(0);expect(t.scores.units).toHaveLength(1)}
  const replay=await request(system,'/api/platform/survey-standard/approve',approve);expect(replay.latestTrial).toEqual(online.latestTrial)
  expect(await db.$queryRaw`SELECT id FROM survey_standard_trials WHERE release_id=${online.id}`).toHaveLength(3)
  const standard=await (await import('../../modules/survey/standard-triplet.service')).standardReleaseRow(db,online.id)
  if(!standard?.measurement_release)throw new Error('Real ONLINE approval did not bind measurement release')
  stage='exact-21b-use-grant';const rootId=randomUUID()
  await request(system,'/api/admin/permissions/content-grants',{requestId:rootId,expectedVersion:0,reason:'Single synthetic source distribution',grant:{subjectId:issuer.id,scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[standard.measurement_release.releaseId]},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
  await request(issuer,`/api/questionnaire-products/standard-combinations/${online.id}/use-grants`,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash,grantId:rootId})
  stage='teacher-author-and-publish'
  const course=await db.course.create({data:{creatorId:teacher.id,title:'Synthetic dot356 vertical',courseType:'TRAINING_COURSE',courseCode:'dot356-'+randomUUID(),status:'PUBLISHED'}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:student.id,status:'ACTIVE'}})
  let row=await request(teacher,'/api/questionnaire-products',{requestId:randomUUID(),name:'Synthetic dot356 single standard source',questionnaireType:'COURSE',courseIds:[course.id]})
  row=await request(teacher,`/api/questionnaire-products/${row.id}/items`,{revision:row.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}})
  row=await request(teacher,`/api/questionnaire-products/${row.id}/items`,{revision:row.revision,item:{type:'SCALE',scaleId:installed.scaleId,required:true,standardCombination:pointer}})
  row=await request(teacher,`/api/questionnaire-products/${row.id}/publish`,{revision:row.revision})
  stage='student-context-and-final'
  const start=await request(student,`/api/composite-assessments/${row.id}/attempts`,{}),attemptId=start.attempt.id,path=`/api/composite-assessments/attempts/${attemptId}`
  let state=await request(student,path);expect(state.currentItem.type).toBe('FORM_SECTION');const section=state.currentItem
  await request(student,`${path}/form-sections/${section.id}/submit`,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:section.answers.map((a:any)=>({formItemId:a.formItemId??a.id,value:'7'}))})
  state=await request(student,path);expect(state.currentItem.type).toBe('SCALE');const item=state.currentItem
  const input={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:source.executable!.definition.items.map((i:any)=>({itemCode:i.itemCode,responseValue:'3'}))}
  const finalPath=`${path}/items/${item.id}/scale/submit?response=receipt`
  await request(student,finalPath,input);await request(student,finalPath,input)
  // Child receipt is not parent completion. Exercise normal authorized reload.
  stage='authorized-reload-parent-and-facts';state=await request(student,path);expect(state.status).toBe('COMPLETED')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}});expect(parent.status).toBe('COMPLETED');expect(parent.trainingContentInterpretationHash).toMatch(/^[a-f0-9]{64}$/)
  const receipt=(await import('../../modules/composite/training-content-final')).decodeTrainingFinalReceipt(parent)!
  expect(receipt).toBeTruthy();expect(receipt.interpretation.units).toHaveLength(1)
  expect(receipt.interpretation.units[0].references.length).toBeGreaterThan(0)
  expect(receipt.interpretation.units[0].report.status).toBe('READY')
  const stored=await (await import('./dot356-standard-vertical-storage.fixture')).verifyDot356StoredFinal(db,attemptId,input.submissionId)
  const {snapshots,canonical}=stored
  stage='teacher-frozen-pr-read';const report=await request(teacher,`/api/composite-assessments/${row.id}/attempts/${attemptId}/report`)
  expect(report.contentReports).toHaveLength(1)
  const bound=parent.trainingContentBinding.units.find((u:any)=>u.itemId===item.id)
  expect(bound).toBeTruthy();expect(bound.report).toBeTruthy()
  const frozen=bound.source.standardCombination.reference.combination
  expect(frozen.releaseId).toBe(pointer.releaseId);expect(frozen.combinationHash).toBe(pointer.combinationHash)
  for(const axis of ['CONTENT','PARAMETERS','REPORT']){
   expect(frozen.axes[axis].axisHash).toBe(candidate.selection[axis]);expect(frozen.axes[axis].version).toBe(online.versions[axis].version)
  }
  const repository=await import('../../modules/measurement-content/repository')
  const declared:any=await repository.getContentRelease(db,bound.report.releaseId)
  expect(declared.status).toBe('PUBLISHED');expect(declared.contentHash).toBe(bound.report.contentHash)
  expect(declared.content.template.blocks.length).toBeGreaterThan(0)
  expect(report.contentReports[0].reportRelease).toEqual(bound.report)
  const disclosureModule=await import('../../modules/composite/training-metric-disclosure')
  const disclosure=await disclosureModule.loadTrainingMetricDisclosure(db,{parent,unit:bound,source:snapshots[0],audience:'teacher',core:canonical[0].core})
  const allowed=disclosureModule.trainingReportDisclosureAllowed(disclosure,declared.content)
  expect(report.contentReports[0].status).toBe(allowed?'READY':'UNAVAILABLE')
  if(allowed){expect(report.contentReports[0].rendered.blocks.length).toBeGreaterThan(0)}
  else {
   // Expected fail-closed policy, not arbitrary report absence or a missing template.
   expect(disclosure.capabilities.scoreDerivedLabels).toBe(false)
   expect(disclosure.capabilities.individualInterpretations).toBe(false)
   expect(declared.content.template.blocks.some((b:any)=>b.type==='REFERENCE_BAND')).toBe(true)
   expect(report.contentReports[0].rendered).toBeNull()
   summary.teacherReportPolicyReason='REFERENCE_BAND_REQUIRES_SCORE_DERIVED_LABELS'
  }
  // Teacher individualInterpretations=false remains authoritative, not elevated for this test.
  await request(outsider,path,undefined,403)
  Object.assign(summary,{combination:pointer,trials:3,...stored.safe,parentStatus:parent.status,teacherReportStatus:report.contentReports[0].status,httpRequestCount:events.length})
  completedCases++
 },180000)
 it.skipIf(authorityContinuation||receiptContinuation)('stores exactly one role/delegation basis and protects active use identity in PostgreSQL',async()=>{
  stage='persisted-use-authority-constraints'
  expect(summary.combination).toBeTruthy()
  const use=await db.materialGrant.findUniqueOrThrow({where:{teacherId_resourceType_resourceId:{teacherId:teacher.id,resourceType:'STANDARD_COMBINATION',resourceId:summary.combination.releaseId}}})
  expect(use.authorityGrantId).toBeNull();expect(use.authorityEntryGrantId).toBeTruthy();expect(use.authorityEntryGrantVersion).toBe(1)
  const root=await db.contentCapabilityGrant.findFirstOrThrow({where:{subjectId:issuer.id}})
  for(const [delegated,entry,version]of [[null,null,null],[null,use.authorityEntryGrantId,null],[root.id,use.authorityEntryGrantId,1]]){
   await expect(db.$executeRaw`INSERT INTO material_grants(id,teacher_id,resource_type,resource_id,granted_by,standard_combination_hash,authority_grant_id,authority_entry_grant_id,authority_entry_grant_version)
    VALUES(${randomUUID()},${outsider.id},'STANDARD_COMBINATION',${use.resourceId},${issuer.id},${use.standardCombinationHash},${delegated},${entry},${version})`).rejects.toThrow('standard_combination_use_identity')
  }
  await expect(db.$executeRaw`UPDATE material_grants SET version=version+1,authority_entry_grant_version=authority_entry_grant_version+1 WHERE id=${use.id}`).rejects.toThrow('Exact use must transition')
  await expect(db.$executeRaw`DELETE FROM material_grants WHERE id=${use.id}`).rejects.toThrow('history must be retained')
  expect(await db.materialGrant.findUniqueOrThrow({where:{id:use.id}})).toEqual(use)
  completedCases++
 })
 it.skipIf(receiptContinuation)('keeps entry-role revocation separate from explicit reissue through the original exact 21B root',async()=>{
  stage='entry-role-and-delegation-lifecycle'
  expect(summary.combination).toBeTruthy()
  const pointer=summary.combination,use=await db.materialGrant.findUniqueOrThrow({where:{teacherId_resourceType_resourceId:{teacherId:teacher.id,resourceType:'STANDARD_COMBINATION',resourceId:pointer.releaseId}}})
  const standard=await (await import('../../modules/survey/standard-triplet.service')).standardReleaseRow(db,pointer.releaseId)
  const root=await db.contentCapabilityGrant.findFirstOrThrow({where:{subjectId:issuer.id}})
  const assertUse=()=>db.$transaction((tx:any)=>(import('../../modules/measurement-content/standard-combination-use')).then(m=>m.assertTrainingStandardUse(tx,{userId:teacher.id,combination:pointer,measurementReleaseId:standard.measurement_release!.releaseId})))
  // Formal role alone is sufficient; no content root is sent or fabricated.
  const replay=await request(issuer,`/api/questionnaire-products/standard-combinations/${pointer.releaseId}/use-grants`,{requestId:use.id,userId:teacher.id,combinationHash:pointer.combinationHash})
  expect(replay.replayed).toBe(true);expect(replay.version).toBe(1)
  await request(system,`/api/questionnaire-products/standard-combinations/${pointer.releaseId}/use-grants`,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash,grantId:root.id},403)
  const changeRole=async(active:boolean,expectedVersion:number)=>{
   const {changeEntryGrant}=await import('../../modules/admin-permissions/service')
   await changeEntryGrant({actorUserId:system.id,targetUserId:issuer.id,entry:'TRAINING',active,expectedVersion,reason:'Isolated authority lifecycle check',actorSession:{...proof,tokenVersion:system.tokenVersion}})
   issuer=await db.user.findUniqueOrThrow({where:{id:issuer.id}})
  }
  await changeRole(false,1)
  await expect(assertUse()).rejects.toMatchObject({statusCode:403})
  await changeRole(true,2)
  await expect(assertUse()).rejects.toThrow('入口分配依据已变化')
  await changeRole(false,3)
  await request(system,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:1,reason:'Explicit synthetic reissue under delegated authority'})
  const reissue=await request(issuer,`/api/questionnaire-products/standard-combinations/${pointer.releaseId}/use-grants`,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash,grantId:root.id,expectedUseVersion:2})
  expect(reissue.id).toBe(use.id);expect(reissue.version).toBe(3)
  expect(await assertUse()).toMatchObject({authorityGrantId:root.id,useGrantVersion:3})
  const stored=await db.materialGrant.findUniqueOrThrow({where:{id:use.id}})
  expect(stored.authorityGrantId).toBe(root.id);expect(stored.authorityEntryGrantId).toBeNull();expect(stored.authorityEntryGrantVersion).toBeNull()
  await request(outsider,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:3,reason:'Foreign issuer cannot revoke'},403)
  expect(await request(issuer,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:3,reason:'Original exact delegate revokes own use'})).toMatchObject({version:4,revoked:true})
  await request(issuer,`/api/questionnaire-products/standard-combinations/${pointer.releaseId}/use-grants`,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash,grantId:root.id,expectedUseVersion:4})
  // A later entry appointment cannot replace the use's original exact root.
  await changeRole(true,4)
  expect(await assertUse()).toMatchObject({authorityGrantId:root.id,useGrantVersion:5})
  await request(system,`/api/admin/permissions/content-grants/${root.id}/revoke`,{expectedVersion:root.version,reason:'Synthetic delegated root withdrawal'})
  await request(issuer,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:5,reason:'Revoked original root cannot be replaced by later entry role'},403)
  await expect(assertUse()).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  const unchanged=await db.materialGrant.findUniqueOrThrow({where:{id:use.id}})
  expect(unchanged).toMatchObject({version:5,authorityGrantId:root.id,authorityEntryGrantId:null,revokedAt:null})
  // Historical reads retain frozen provenance and the normal participant/data ACL.
  const completed=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{userId:student.id,status:'COMPLETED'}})
  expect((await request(student,`/api/composite-assessments/attempts/${completed.id}`)).status).toBe('COMPLETED')
  expect((await request(teacher,`/api/composite-assessments/${completed.compositeAssessmentId}/attempts/${completed.id}/report`)).contentReports).toHaveLength(1)
  await changeRole(false,5)
  completedCases++
 })
 it.skipIf(authorityContinuation)('keeps admitted FINAL and durable whole receipts finishable after withdrawal and emergency stop',async()=>{
  stage='admitted-final-and-durable-receipt'
  const pointer=summary.combination,use=await db.materialGrant.findUniqueOrThrow({where:{teacherId_resourceType_resourceId:{teacherId:teacher.id,resourceType:'STANDARD_COMBINATION',resourceId:pointer.releaseId}}})
  if(receiptContinuation)await request(issuer,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:use.version,reason:'Revoked exact root cannot revoke'},403)
  const {changeEntryGrant}=await import('../../modules/admin-permissions/service')
  const entry=await db.adminEntryGrant.findUniqueOrThrow({where:{userId_entry:{userId:issuer.id,entry:'TRAINING'}}})
  // Fresh cases include two more audited role changes. An explicitly fenced
  // old receipt continuation retains its original version-4 fixture.
  expect(entry.revokedAt).not.toBeNull()
  if(receiptContinuation)expect([4,6]).toContain(entry.version)
  else expect(entry.version).toBe(6)
  await changeEntryGrant({actorUserId:system.id,targetUserId:issuer.id,entry:'TRAINING',active:true,expectedVersion:entry.version,reason:'Synthetic current role for receipt scenario',actorSession:{...proof,tokenVersion:system.tokenVersion}})
  issuer=await db.user.findUniqueOrThrow({where:{id:issuer.id}})
  await request(system,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:use.version,reason:'Explicit role-basis reissue'})
  await request(issuer,`/api/questionnaire-products/standard-combinations/${pointer.releaseId}/use-grants`,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash,expectedUseVersion:use.version+1})
  const scale=await db.scale.findFirstOrThrow({where:{code:KEY,instrumentVersion:VERSION}})
  const source=(await import('../../modules/scale/onboarding/instrument-registry')).getScaleInstrumentSource(KEY,VERSION)!
  const course=await db.course.findFirstOrThrow({where:{creatorId:teacher.id}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:outsider.id,status:'ACTIVE'}})
  let q=await request(teacher,'/api/questionnaire-products',{requestId:randomUUID(),name:'Receipt survival synthetic',questionnaireType:'COURSE',courseIds:[course.id]})
  q=await request(teacher,`/api/questionnaire-products/${q.id}/items`,{revision:q.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}})
  q=await request(teacher,`/api/questionnaire-products/${q.id}/items`,{revision:q.revision,item:{type:'SCALE',scaleId:scale.id,required:true,standardCombination:pointer}})
  q=await request(teacher,`/api/questionnaire-products/${q.id}/publish`,{revision:q.revision})
  const enter=async(user:any)=>{
   const start=await request(user,`/api/composite-assessments/${q.id}/attempts`,{}),path=`/api/composite-assessments/attempts/${start.attempt.id}`
   let state=await request(user,path);const section=state.currentItem
   await request(user,`${path}/form-sections/${section.id}/submit`,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:section.answers.map((a:any)=>({formItemId:a.formItemId??a.id,value:'7'}))})
   state=await request(user,path);expect(state.currentItem.type).toBe('SCALE')
   return {path,state,attemptId:start.attempt.id,user}
  }
  const individual=await enter(student)
  process.env.ASSESSMENT_REPORT_ASYNC_ENABLED='true';process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED='true'
  try{
   const received=await enter(outsider),whole=await import('../../modules/composite/whole-questionnaire.service')
   const definition=await whole.getWholeQuestionnaireDefinition(received.attemptId,{userId:outsider.id})
   const answers=source.executable!.definition.items.map((i:any)=>({itemCode:i.itemCode,responseValue:'3'}))
   const input={submissionId:randomUUID(),attemptEpoch:received.state.attemptEpoch,slotSetHash:definition.slotSetHash!,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(u=>({itemId:u.itemId,definitionHash:u.definitionHash,answers}))}
   const ack=await whole.submitWholeQuestionnaire(received.attemptId,input,{userId:outsider.id});expect(ack.status).toBe('ACCEPTED')
   const row=await (await import('../../modules/survey/standard-triplet.service')).standardReleaseRow(db,pointer.releaseId)
   await request(system,`/api/platform/survey-standard/${pointer.releaseId}/withdraw`,{expectedVersion:row.version,reason:'Synthetic withdrawal after durable ACK'})
   const stop=(await import('../../modules/scale-library-governance/service')).stopCollection
   await db.$transaction((tx:any)=>stop(tx,system.id,'TRAINING_SCALE',scale.id,'Synthetic stop after START and ACK'))
   await expect(db.$transaction((tx:any)=>(import('../../modules/measurement-content/standard-combination-source')).then(m=>m.readCurrentStandardCombination(tx,pointer,'COLLECTION')))).rejects.toThrow('NOT_CURRENT')
   const outbox=await import('../../modules/assessment-runtime/report-outbox.service'),job=await outbox.claimCompositeReportJob()
   expect(job?.attemptId).toBe(received.attemptId);expect(job?.wholePayloadHash).toBe(ack.payloadHash)
   const execution={submissionId:input.submissionId,payloadHash:ack.payloadHash,acceptedAtMs:job!.wholeAcceptedAt!.getTime(),leaseToken:job!.leaseToken!}
   const guard=(await import('../../modules/scale/scale-collection-guard')).assertTrainingScaleCollectionAllowed
   for(const bad of [{...execution,payloadHash:'f'.repeat(64)},{...execution,leaseToken:randomUUID()}]){
    await expect(db.$transaction((tx:any)=>guard(tx,[scale.id],{compositeAttemptId:received.attemptId,compositeAttemptEpoch:received.attemptEpoch,compositeItemIds:definition.units.map(u=>u.itemId),acceptedReceipt:bad}))).rejects.toThrow('REPORT_PROCESSING_LEASE_LOST')
   }
   expect(await db.assessmentResultFact.count({where:{assessment:{compositeAttemptId:received.attemptId}}})).toBe(0)
   expect(await whole.processWholeQuestionnaireAnswers(job!)).toBe(true)
   expect(await whole.processWholeQuestionnaireAnswers(job!)).toBe(true)
   expect(await db.assessment.findMany({where:{compositeAttemptId:received.attemptId},select:{status:true}})).toEqual([{status:'COMPLETED'}])
   expect(await whole.submitWholeQuestionnaire(received.attemptId,input,{userId:outsider.id})).toMatchObject({replayed:true,payloadHash:ack.payloadHash})
   process.env.ASSESSMENT_REPORT_ASYNC_ENABLED='false'
   const item=individual.state.currentItem
   await request(student,`${individual.path}/items/${item.id}/scale/submit?response=receipt`,{submissionId:randomUUID(),attemptEpoch:individual.state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:individual.state.contextSnapshotHash,answers})
   expect((await request(student,individual.path)).status).toBe('COMPLETED')
   completedCases++
  }finally{process.env.ASSESSMENT_REPORT_ASYNC_ENABLED='false';delete process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED}
 },180000)
})
