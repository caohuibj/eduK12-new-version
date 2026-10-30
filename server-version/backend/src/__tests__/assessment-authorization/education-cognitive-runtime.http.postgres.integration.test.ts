import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME} from '../../utils/authCookies'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_RUNTIME==='1'?describe:describe.skip
suite('Exact education native profiles through formal protected Run and participant routes',()=>{
 const reverse=process.env.PRECISE_EDUCATION_RUNTIME_COUNTERPARTS==='1'
 let entries:any,db:any,state:any,server:Server|undefined,base='',sign:any,system:any,stage='init'
 const requests:any[]=[],observations:any[]=[],password='Synthetic-manager-test-20261029!'
 const profileFor=(product:string)=>reverse?(product==='SCHOOL'?'research':'experience'):(product==='SCHOOL'?'experience':'research')
 const count=(product:string)=>profileFor(product)==='experience'?8:60
 async function checkpoint(){await writeFile(process.env.PRECISE_EDUCATION_RUNTIME_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
 async function call(actor:any,product:'SCHOOL'|'TEACHER',method:string,path:string,body?:unknown,status=200){
  const platform=actor.accountDomain!=='SCHOOL',teacher=product==='TEACHER',csrf='education-precise-native-runtime'
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,
   ...(platform?{adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}:{mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacher?{sessionProduct:'HUITEACHER'}:{})})})
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',Cookie:(platform?'ptool_session':teacher?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME)+'='+token+'; '+(platform?'ptool_csrf':teacher?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME)+'='+csrf,'X-CSRF-Token':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({stage,product,method,path,status:response.status,expectedStatus:status});expect(response.status,value.message??path).toBe(status);return value.data
 }
 const ownerPrefix=(p:'SCHOOL'|'TEACHER',e:any)=>(p==='SCHOOL'?'/campus':'/huiteacher')+'/organizations/'+e.organizationId
 const managePrefix=(p:'SCHOOL'|'TEACHER',e:any)=>'/platform/education/organizations/'+e.organizationId+'/products/'+(p==='SCHOOL'?'HUISCHOOL':'HUITEACHER')+'/cognitive-profile-configurations'
 beforeAll(async()=>{
  const u=new URL(process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL!);requireIsolatedReleaseDatabase(u.toString())
  if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/precise_education_cognitive_runtime_test_20261030'||u.username!=='precise_task1_runtime')throw Error('Actual restricted runtime only, not metadata fixture owner')
  db=(await import('../../config/database')).prisma
  expect(await db.user.count()).toBe(13);const [role]=await db.$queryRaw`SELECT rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`;expect(role).toEqual({rolsuper:false,rolcreaterole:false,rolbypassrls:false})
  state=JSON.parse(await readFile(process.env.PRECISE_EDUCATION_RUNTIME_CHECKPOINT!,'utf8'));entries=reverse?(state.counterpartRuntimeEntries??={}):state.runtimeEntries;system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}});sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default)
  app.use('/api/campus',(await import('../../modules/campus/organization.routes')).default,(await import('../../modules/campus/activity.routes')).default,(await import('../../modules/campus/activity.run.routes')).default,(await import('../../modules/campus/composite.routes')).default)
  app.use('/api/huiteacher',(await import('../../modules/huiteacher/organization.routes')).default,(await import('../../modules/huiteacher/evaluation.routes')).default,(await import('../../modules/huiteacher/run.routes')).default,(await import('../../modules/huiteacher/assessmentRuntime.routes')).createTeacherAssessmentRuntimeRouter((await import('../../modules/huiteacher/assessmentRuntime.source')).teacherAssessmentRuntimeSource))
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port;stage='ready'
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_EVIDENCE??'/tmp/education-cognitive-runtime.json',JSON.stringify({productionAccessed:false,counterpartProfiles:reverse,stage,requests,observations,scope:'Actual restricted runtime PostgreSQL; separate owner-created identity/organization fixture, normal existing source approvals reused from exact clone. Protected manager/author/run/participant HTTP with real current role checks and synthetic recent-MFA JWT. NODE_ENV=test: existing rate limiter is disabled by its normal test mode; no production rate-limit qualification. No stimulus/UI timing/layout or scorer changes.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.skipIf(!reverse)('creates only two counterpart workflows using the same qualified people and existing exact M delegation',async()=>{
  if(Object.keys(entries).length)throw Error('Inspect retained counterpart workflow metadata before retry')
  for(const product of ['SCHOOL','TEACHER'] as const){
   const old=state.runtimeEntries[product];if(!old.completed)throw Error('Original native chain must already be completed and read back')
   const owner=await db.user.findUniqueOrThrow({where:{id:old.userId}}),participant=await db.user.findUniqueOrThrow({where:{id:old.participantUserId}})
   const prior=await call(participant,product,'GET',(product==='SCHOOL'?'/campus':'/huiteacher')+'/run-executions/'+old.enteredExecutionId+'/feedback');old.feedbackHash=canonicalHash(prior);await checkpoint()
   const e:any={organizationId:old.organizationId,manager:old.manager,userId:old.userId,participantUserId:old.participantUserId,subjectMembershipId:old.subjectMembershipId,classUnitId:old.classUnitId,rootId:old.rootId};entries[product]=e;await checkpoint()
   if(product==='SCHOOL'){
    const activity=await call(owner,product,'POST',ownerPrefix(product,e)+'/activities',{title:'Synthetic exact research counterpart',purpose:'STUDENT_WELLBEING'});e.workflowId=activity.id;await checkpoint()
    await call(owner,product,'POST',ownerPrefix(product,e)+'/activities/'+e.workflowId+'/participants',{classUnitIds:[e.classUnitId],requestKey:randomUUID(),expectedVersion:1})
    const run=await call(owner,product,'POST',ownerPrefix(product,e)+'/activities/'+e.workflowId+'/runs',{name:'Exact research counterpart Run'});e.runId=run.id
   }else{
    const [original]=await db.$queryRaw`SELECT target_id FROM huiteacher_evaluation_events WHERE id=${old.workflowId}`
    const event=await call(owner,product,'POST',ownerPrefix(product,e)+'/evaluation-events',{targetId:original.target_id,kind:'ASSESSMENT',title:'Synthetic exact experience counterpart'});e.workflowId=event.id;await checkpoint()
    const run=await call(owner,product,'POST',ownerPrefix(product,e)+'/evaluation-events/'+e.workflowId+'/run',{name:'Exact experience counterpart Run'});e.runId=run.runId
   }
   const [run]=await db.$queryRaw`SELECT version,status FROM assessment_runs WHERE id=${e.runId}`;expect(run.status).toBe('DRAFT');e.runVersion=run.version;await checkpoint()
  }
 },30000)
 it.each(['SCHOOL','TEACHER'] as const)('%s issues exact use, freezes two roots and publishes the real participant Run',async product=>{
  const e=entries[product],manager=await db.user.findUniqueOrThrow({where:{id:state.entries[product].managerId}}),owner=await db.user.findUniqueOrThrow({where:{id:e.userId}}),profile=profileFor(product),source=state.profiles[profile]
  const resume=process.env.PRECISE_EDUCATION_RUNTIME_RESUME==='frozen'
  if(resume?(!e.rootId||!e.useId||e.published):Boolean(e.useId||e.versions))throw Error('Inspect retained stage; no repeated grant, root or task creation')
  if(!resume){
  if(!e.rootId){
  const root=await call(system,product,'POST','/admin/permissions/content-grants',{requestId:randomUUID(),expectedVersion:0,reason:'Exact native M for separate synthetic formal Run',grant:{subjectId:manager.id,scope:{product,scopeKind:'ORGANIZATION',scopeId:e.organizationId,resourceKind:'material',resourceKeys:[source.configuration.measurement.releaseId]},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
  e.rootId=root.grantId;stage=product+'-delegated';await checkpoint()
  }
  const use=await call(manager,product,'POST',managePrefix(product,e)+'/'+state.configId+'/'+profile+'/use-grants',{currentPassword:password,requestId:randomUUID(),userId:owner.id,artifactHash:source.artifactHash,authorityGrantId:e.rootId,expectedAuthorityVersion:1,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'正式链路固定'+(profile==='experience'?'体验':'科研')+'配置'})
  e.useId=use.id;e.profile=profile;stage=product+'-use';await checkpoint()
  }else{expect(await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:e.useId}})).toMatchObject({revokedAt:null,version:1,subjectId:owner.id,product,scopeId:e.organizationId})}
  if(reverse){
   const old=state.runtimeEntries[product],participant=await db.user.findUniqueOrThrow({where:{id:old.participantUserId}})
   const waiting=product==='SCHOOL'?old.runPath+'/executions/'+old.waitingExecutionId+'/start':'/huiteacher/run-executions/'+old.waitingExecutionId+'/start-assessment'
   await call(participant,product,'POST',waiting,{},403)
  }
  const author=ownerPrefix(product,e)+'/private-tools',catalog=await call(owner,product,'GET',author+'/public-sources?kind=COGNITIVE'),choice=catalog.list.find((r:any)=>r.artifactHash===source.artifactHash)
  expect(choice).toMatchObject({profile,selectedBinding:{authorizationId:e.useId}});e.versions??=[];await checkpoint()
  const run=ownerPrefix(product,e)+(product==='SCHOOL'?'/activities/'+e.workflowId+'/runs/'+e.runId:'/evaluation-events/'+e.workflowId+'/run');e.runPath=run
  for(let index=0;index<2;index++){
   let fixed=e.versions[index]
   if(!fixed){
   const draft=await call(owner,product,'POST',author,{kind:'COMPOSITION',title:'Synthetic precise native '+product+' '+index})
   const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'Fixed native profile, synthetic automated participant only',blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'COGNITIVE_CONFIG',kind:'COGNITIVE',versionId:state.configId,contentHash:choice.contentHash,profile,artifactHash:source.artifactHash,selectedBinding:choice.selectedBinding}}]}
   const saved=await call(owner,product,'PUT',author+'/'+draft.id,{expectedRevision:1,title:draft.title,definition});fixed=await call(owner,product,'POST',author+'/'+draft.id+'/freeze',{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
   e.versions.push(fixed);await checkpoint()
   }
   const tracks=await db.$queryRaw`SELECT resource_key FROM assessment_run_tracks WHERE run_id=${e.runId}`
   if(!tracks.some((t:any)=>t.resource_key===fixed.runtime.resourceKey))await call(owner,product,'POST',run+'/tracks',{expectedVersion:e.runVersion,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[e.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[e.subjectMembershipId]}})
   const [row]=await db.$queryRaw`SELECT version FROM assessment_runs WHERE id=${e.runId}`;e.runVersion=row.version;await checkpoint()
  }
  if(product==='SCHOOL'){
   const activity=ownerPrefix(product,e)+'/activities/'+e.workflowId,detail=await call(owner,product,'GET',activity),submitted=await call(owner,product,'POST',activity+'/submit',{expectedVersion:detail.version})
   await call(owner,product,'POST',activity+'/govern',{action:'OPEN',expectedVersion:submitted.version})
  }else await call(owner,product,'POST',ownerPrefix(product,e)+'/evaluation-events/'+e.workflowId+'/transition',{action:'OPEN',expectedVersion:1})
  await call(owner,product,'POST',run+'/publish',{expectedVersion:e.runVersion})
  const executions=await db.$queryRaw`SELECT x.id,t.resource_key FROM assessment_run_executions x JOIN assessment_run_tracks t ON t.id=x.track_id WHERE x.run_id=${e.runId}`
  expect(executions).toHaveLength(2);e.enteredExecutionId=executions.find((x:any)=>x.resource_key===e.versions[0].runtime.resourceKey).id;e.waitingExecutionId=executions.find((x:any)=>x.resource_key===e.versions[1].runtime.resourceKey).id;e.published=true;stage=product+'-published';await checkpoint()
  observations.push({product,runId:e.runId,profile,artifactHash:source.artifactHash,twoFrozenVersions:true,twoRealPublishedExecutions:true,restrictedRole:true})
 },60000)
 it.each(['SCHOOL','TEACHER'] as const)('%s preserves admitted seed and FINAL after ordinary revoke while stopping a waiting new START',async product=>{
  const e=entries[product],retained=process.env.PRECISE_EDUCATION_RUNTIME_RESUME==='completed'
  if(!e.published||(retained?(!e.attemptId||!e.sessionId||!e.revoked):Boolean(e.attemptId)))throw Error('Inspect retained publication/admission before any new START')
  const participant=await db.user.findUniqueOrThrow({where:{id:e.participantUserId}}),manager=await db.user.findUniqueOrThrow({where:{id:state.entries[product].managerId}})
  const prefix=product==='SCHOOL'?'/campus':'/huiteacher',execution=(id:string)=>product==='SCHOOL'?e.runPath+'/executions/'+id:prefix+'/run-executions/'+id,start=(id:string)=>execution(id)+(product==='SCHOOL'?'/start':'/start-assessment')
  if(retained){
   const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:e.attemptId}}),session=await db.cognitiveSession.findUniqueOrThrow({where:{id:e.sessionId}})
   expect(parent.status).toBe('COMPLETED');expect(session.status).toBe('COMPLETED')
   expect(parent.trainingContentBinding.units[0].source.educationNative).toMatchObject({profile:e.profile,artifactHash:state.profiles[e.profile].artifactHash,selectedBinding:{authorizationId:e.useId}})
   const raw=await db.cognitiveRawSubmission.findUniqueOrThrow({where:{sessionId_attemptEpoch:{sessionId:e.sessionId,attemptEpoch:session.attemptNo}}})
   expect(raw).toMatchObject({payloadSchemaVersion:1,encodingVersion:'CANONICAL_JSON_SHA256_V1',trialCount:count(product)})
   const decoded=(await import('../../modules/cognitive/unified-raw-submission')).parseUnifiedCognitiveRawSubmissionPayload((await import('../../modules/assessment-runtime/security')).decryptUnifiedRuntimePayload(raw.payloadEncrypted))
   const trialCount=decoded.trials.length;expect(trialCount).toBe(raw.trialCount);expect(decoded.attemptEpoch).toBe(session.attemptNo)
   const feedbackPath=prefix+'/run-executions/'+e.enteredExecutionId+'/feedback',feedback=await call(participant,product,'GET',feedbackPath)
   const other=await db.user.findUniqueOrThrow({where:{id:state.entries[product].userId}});await call(other,product,'GET',feedbackPath,undefined,404)
   expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:e.versions[1].runtime.compositeId}})).toBe(0)
   e.completed=true;stage=product+'-retained-complete';await checkpoint();observations.push({product,profile:e.profile,runId:e.runId,attemptId:e.attemptId,sessionId:e.sessionId,retainedCompletedNativeChain:true,noRepeatedStartRevokeOrFinal:true,nativeTrialCount:trialCount,parentCompleted:true,historicalFeedbackReadable:true,feedbackState:feedback.state,unitStates:feedback.units?.map((u:any)=>u.state),otherUserDenied404:true,waitingParentAttempts:0});return
  }
  const tasks=product==='TEACHER'?(await call(participant,product,'GET',prefix+'/my-assessment-tasks')).list:(await(await import('../../modules/campus/activity.tasks')).listCampusStudentTasks({userId:participant.id,username:participant.username,role:participant.role,accountDomain:'SCHOOL',tokenVersion:participant.tokenVersion,platformRole:participant.platformRole,mustChangePassword:participant.mustChangePassword},{page:1,pageSize:20,activityId:e.workflowId})).list
  for(const id of [e.enteredExecutionId,e.waitingExecutionId])if(tasks.find((t:any)=>(t.executionId??t.id)===id)?.consentRequired)await call(participant,product,'POST',execution(id)+(product==='SCHOOL'?'/consent/accept':'/assessment-consent/accept'),{})
  const started=await call(participant,product,'POST',start(e.enteredExecutionId),{});expect(started.state).toBe('STARTED');e.attemptId=started.runtimeBindingRef;stage=product+'-admitted';await checkpoint()
  const path=prefix+(product==='SCHOOL'?'/composite-attempts/':'/assessment-composite-attempts/')+e.attemptId
  const view=await call(participant,product,'GET',path+'?view=current-unit');expect(view.currentItem.type).toBe('COGNITIVE')
  const stored=await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:e.attemptId}});e.sessionId=stored.id;e.itemId=stored.compositeItemId;await checkpoint()
  const child=path+'/items/'+e.itemId+'/cognitive/'+e.sessionId,session=await call(participant,product,'GET',child)
  expect(session).toMatchObject({profile:e.profile,config:{totalTrials:count(product)}})
  const frozen=(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:e.attemptId}})).trainingContentBinding
  await call(manager,product,'POST',managePrefix(product,e)+'/'+state.configId+'/use-grants/'+e.useId+'/revoke',{currentPassword:password,requestId:randomUUID(),expectedVersion:1,reason:'Ordinary withdrawal after exact native Run admission'});e.revoked=true;stage=product+'-revoked';await checkpoint()
  await call(participant,product,'POST',start(e.waitingExecutionId),{},403)
  expect(await call(participant,product,'POST',start(e.enteredExecutionId),{})).toMatchObject({runtimeBindingRef:e.attemptId,replayed:true})
  expect((await call(participant,product,'GET',child)).randomSeed).toBe(session.randomSeed)
  const {createTrialEnvelope}=await import('../../modules/cognitive/v2/trial-envelope'),trials=Array.from({length:count(product)},(_,i)=>createTrialEnvelope({trialIndex:i,phase:'test',payload:{foreperiodMs:800,rtMs:300+i,prematureCount:0,interrupted:false,inputMode:'keyboard'},startedAtPerfMs:i*3000,endedAtPerfMs:i*3000+1200}))
  e.submissionId='exact-education-profile-'+randomUUID();await checkpoint()
  const input={submissionId:e.submissionId,attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,contextSnapshotHash:session.contextSnapshotHash,trials,administrationProvenance:{schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}}
  expect(await call(participant,product,'POST',child+'/submit',input)).toMatchObject({completed:true});expect((await call(participant,product,'POST',child+'/submit',input)).replayed).toBe(true)
  expect((await call(participant,product,'GET',path)).status).toBe('COMPLETED')
  expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:e.attemptId}})).trainingContentBinding).toEqual(frozen)
  const feedbackPath=prefix+'/run-executions/'+e.enteredExecutionId+'/feedback',feedback=await call(participant,product,'GET',feedbackPath)
  expect(await call(participant,product,'GET',feedbackPath)).toEqual(feedback)
  if(reverse){const old=state.runtimeEntries[product],prior=await call(participant,product,'GET',prefix+'/run-executions/'+old.enteredExecutionId+'/feedback');expect(canonicalHash(prior)).toBe(old.feedbackHash)}
  const other=await db.user.findUniqueOrThrow({where:{id:state.entries[product].userId}});await call(other,product,'GET',feedbackPath,undefined,404)
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:e.versions[1].runtime.compositeId}})).toBe(0)
  e.completed=true;stage=product+'-complete';await checkpoint();observations.push({product,profile:e.profile,runId:e.runId,attemptId:e.attemptId,sessionId:e.sessionId,newStartAfterRevokeDenied:true,admittedSeedStable:true,nativeTrialCount:count(product),idempotentFinal:true,parentCompleted:true,originalT3BindingUnchanged:true,historicalFeedbackReadable:true,feedbackState:feedback.state,otherUserDenied:true,waitingParentAttempts:0})
 },60000)
})
