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
const KEY='academic_self_concept_biology_zh_cn',VERSION='1.0.0'
/** Fence runs before importing any application module. No acceptance DB access. */
export function assertDot356VerticalIsolation(){
 const u=new URL(process.env.DATABASE_URL??'invalid:')
 if(process.env.NODE_ENV!=='test'||!enabled||!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='55439'
  ||!['/eduk12_dot356_vertical_20261025','/eduk12_dot356_vertical_20261025_v2'].includes(u.pathname)||u.searchParams.has('host')||u.searchParams.has('schema'))throw new Error('Dedicated dot356 vertical DB and explicit opt-in required')
 if(process.env.ADMIN_AUTH_ORIGIN!=='http://localhost:5173')throw new Error('Explicit test origin http://localhost:5173 required')
 if(process.env.ASSESSMENT_REPORT_ASYNC_ENABLED!=='false')throw new Error('Bounded vertical test requires the real synchronous report path')
}
suite('dot356 registered source to real ONLINE and Training FINAL',()=>{
 let db:any,server:Server|undefined,base='',system:any,issuer:any,teacher:any,student:any,outsider:any,generateToken:any,stage='setup'
 const events:any[]=[],summary:any={sourceKey:KEY,sourceVersion:VERSION,status:'NOT_RUN',observation:'single cold synthetic run; table access is not proven redundancy'}
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
  if(await db.user.count()!==0||await db.scale.count()!==0)throw new Error('Fresh schema-only DB required; do not reuse a previous attempt')
  const create=(name:string,role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{username:'dot356-'+name+'-'+randomUUID(),passwordHash:'SYNTHETIC TEST ONLY',role,platformRole,accountDomain:'TRAINING',teacherApproved:role==='TEACHER'}})
  system=await create('system','STUDENT','SYSTEM_ADMIN');issuer=await create('issuer');teacher=await create('teacher','TEACHER');student=await create('student');outsider=await create('outsider')
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:issuer.id,entry:'TRAINING',grantedBy:system.id}})
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
  summary.lastStage=stage;summary.http=events
  summary.processObservation={elapsedMs:performance.now()-startedAt,cpuMicroseconds:process.cpuUsage(cpuStart),memoryStart,memoryEnd:process.memoryUsage(),maxRssKiB:process.resourceUsage().maxRSS,scope:'whole test process, not per-request performance'}
  await writeFile(process.env.DOT356_VERTICAL_OUTPUT??'/tmp/dot356-standard-vertical-result.json',JSON.stringify(summary,null,2),{mode:0o600})
  if(server)await new Promise<void>(r=>server!.close(()=>r()))
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('real installation, three trials, exact 21B, teacher publish, child FINAL, authorized reload and P/R',async()=>{
  summary.status='IN_PROGRESS';stage='install-hidden-publish'
  const registry=await import('../../modules/scale/onboarding/instrument-registry')
  const onboarding=await import('../../modules/scale/onboarding/install'),publication=await import('../../modules/scale/onboarding/publish')
  const source=registry.getScaleInstrumentSource(KEY,VERSION)!,runtime=registry.getScaleInstrumentRuntimePolicy(KEY,VERSION)!
  const install={instrumentKey:KEY,instrumentVersion:VERSION,actorUserId:system.id,deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',
   deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'] as Array<'STANDALONE'|'COMPOSITE'|'QUESTIONNAIRE'>,
   runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:VERSION,inFlightCompletion:'FROZEN_DEADLINE' as const}}
  expect((await onboarding.planScaleInstrumentInstall(db,install)).blockers).toEqual([])
  const installed=await onboarding.installScaleInstrument(db,install);expect(installed.scaleId).toBeTruthy()
  const pub={instrumentKey:KEY,instrumentVersion:VERSION,actorUserId:system.id,visibility:'HIDDEN' as const}
  const pp=await publication.planStandardScalePublication(db,pub);expect(pp.blockers).toEqual([])
  await publication.publishStandardScale(db,{...pub,expectedProofHash:pp.proofHash})
  stage='real-three-trial-approval'
  const candidate=await request(system,`/api/platform/survey-standard/candidate/${KEY}/${VERSION}`)
  const preview=await request(system,'/api/platform/survey-standard/preview',candidate.selection)
  const approve={...candidate.selection,expectedCombinationHash:preview.combinationHash,requestId:randomUUID(),reason:'Dedicated dot356 synthetic vertical test'}
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
  Object.assign(summary,{status:'PASS',combination:pointer,trials:3,...stored.safe,parentStatus:parent.status,teacherReportStatus:report.contentReports[0].status,httpRequestCount:events.length})
 },180000)
})
