import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {Session} from 'node:inspector'
import {writeFile} from 'node:fs/promises'
import express from 'express'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import {Prisma} from '@prisma/client'
import {prisma as db} from '../../config/database'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {adminPermissionsRouter} from '../../modules/admin-permissions/routes'
import questionnaireRoutes from '../../modules/questionnaire-product/routes'
import {readCurrentStandardCombination} from '../../modules/measurement-content/standard-combination-source'
import {assertLibraryAuthority} from '../../modules/scale-library-governance/authority'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {revokeContentAuthority} from '../../modules/measurement-content/content-authority.repository'
import {assertTrainingStandardUse,revokeTrainingStandardCombinationUse} from '../../modules/measurement-content/standard-combination-use'
import {registerWholeQuestionnaireReceipt,REPORT_PARENT_SELECT} from '../../modules/assessment-runtime/report-outbox.service'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {assertStandardSqlIsolation,seedUntriedStandardSqlFixture} from './training-standard-sql.fixture'

const suite=process.env.TRAINING_STANDARD_SQL_ISOLATED==='1'?describe:describe.skip
suite('real PostgreSQL/HTTP source costs and existing 21B issuance, without manufactured ONLINE facts',()=>{
 let fixture:Awaited<ReturnType<typeof seedUntriedStandardSqlFixture>>,server:Server,base:string,rootId:string
 let active:string|null=null
 const sql:Array<{stage:string;query:string;durationMs:number}>=[],http:Array<{method:string;path:string;status:number}>=[]
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 beforeAll(async()=>{
  assertStandardSqlIsolation()
  if(process.env.PERF_ISOLATED_TEST_MODE!=='1'||process.env.PERF_SQL_EVENT_COUNT!=='1')throw new Error('Explicit SQL event collection required')
  ;(db as unknown as {$on:(event:'query',fn:(q:{query:string;duration:number})=>void)=>void}).$on('query',q=>{
   if(active)sql.push({stage:active,query:q.query,durationMs:q.duration})
  })
  fixture=await seedUntriedStandardSqlFixture(db)
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/admin/permissions',adminPermissionsRouter);app.use('/api/questionnaire-products',questionnaireRoutes);app.use(errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  active=null
  await writeFile('/workspace/tool-onboarding-combination-flow-sql-http-setup-trace-'+(process.env.TRAINING_STANDARD_TRACE_NAME??'initial')+'.json',JSON.stringify({fixtureState:'APPROVED_WITHOUT_TRIAL',sql,http,
   limitation:'No ONLINE source or positive user-use/student sample qualified by this setup suite'},null,2),{mode:0o600})
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
  await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()
 })
 async function call(user:typeof fixture.system,path:string,body:unknown,csrf=true){
  const token=generateToken({userId:user.id,username:user.username,role:user.role,accountDomain:'TRAINING',tokenVersion:user.tokenVersion,...proof})
  const response=await fetch(base+path,{method:'POST',headers:{Cookie:'ptool_session='+token+'; ptool_csrf=synthetic-csrf',
   'X-CSRF-Token':csrf?'synthetic-csrf':'wrong',Origin:process.env.ADMIN_AUTH_ORIGIN!,'Content-Type':'application/json'},body:JSON.stringify(body)})
  http.push({method:'POST',path,status:response.status});return {status:response.status,body:await response.json() as any}
 }
 it('records real SQL and V8 CPU work for repeated immutable validation while refusing new use of the untried fixture',async()=>{
  const inspector=new Session();inspector.connect()
  const post=(method:string)=>new Promise<any>((resolve,reject)=>inspector.post(method,(error,result)=>error?reject(error):resolve(result)))
  await post('Profiler.enable');await post('Profiler.start')
  const before=process.cpuUsage(),started=performance.now();active='untried-immutable-source-history-profile'
  const calls=[]
  try{for(let i=0;i<6;i++){
   const start=performance.now(),cpu=process.cpuUsage()
   const source=await db.$transaction(tx=>readCurrentStandardCombination(tx,fixture.pointer,'HISTORY'))
   expect(source.row.state).toBe('APPROVED');expect(source.mapping.axisIdentity.status).toBe('VALID')
   calls.push({elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu)})
  }}finally{active=null}
  const profile=await post('Profiler.stop');inspector.disconnect()
  await writeFile('/workspace/tool-onboarding-standard-combination-profile-before.cpuprofile',JSON.stringify(profile.profile),{mode:0o600})
  await writeFile('/workspace/tool-onboarding-standard-combination-profile-before.json',JSON.stringify({kind:'real-sql-and-cpu-synthetic-immutable-body-profile',purpose:'HISTORY',
   fixtureState:'APPROVED_WITHOUT_TRIAL_NOT_ADMISSIBLE',calls,elapsedMs:performance.now()-started,cpu:process.cpuUsage(before),
   sql:sql.filter(q=>q.stage==='untried-immutable-source-history-profile'),pointer:fixture.pointer},null,2),{mode:0o600})
  await expect(db.$transaction(tx=>readCurrentStandardCombination(tx,fixture.pointer))).rejects.toThrow('STANDARD_COMBINATION_NOT_CURRENT')
  const [trials]=await db.$queryRaw<Array<{count:number}>>(Prisma.sql`SELECT count(*)::int AS count FROM survey_standard_trials WHERE release_id=${fixture.pointer.releaseId}`)
  expect(trials.count).toBe(0)
 })
 it('issues the existing exact C distribution authority over real authenticated HTTP without changing the capability schema',async()=>{
  rootId=randomUUID();active='21b-root-http'
  const body={requestId:rootId,expectedVersion:0,reason:'Dedicated isolated 21B fixture',grant:{subjectId:fixture.issuer.id,
   scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[fixture.measurement.releaseId]},
   capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}}
  const result=await call(fixture.system,'/api/admin/permissions/content-grants',body)
  active=null;expect(result.status,JSON.stringify(result.body)).toBe(200)
  const root=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:rootId}})
  expect(root.resourceKeys).toEqual([fixture.measurement.releaseId]);expect(root.capabilities).toEqual(['material.distribute'])
  expect((await call(fixture.issuer,'/api/admin/permissions/content-grants',{...body,requestId:randomUUID()})).status).toBe(403)
  expect((await call(fixture.system,'/api/admin/permissions/content-grants',{...body,requestId:randomUUID()},false)).status).toBe(403)
 })
 it('does not let that real entry authority turn an untried approval into a user grant',async()=>{
  active='untried-use-denial-http'
  const result=await call(fixture.issuer,'/api/questionnaire-products/standard-combinations/'+fixture.pointer.releaseId+'/use-grants',{
   requestId:randomUUID(),userId:fixture.teacher.id,combinationHash:fixture.pointer.combinationHash,grantId:rootId})
  active=null;expect(result.status,JSON.stringify(result.body)).toBe(409)
  expect(result.body.message).toContain('STANDARD_COMBINATION_NOT_CURRENT')
  expect(await db.materialGrant.count({where:{resourceType:'STANDARD_COMBINATION',resourceId:fixture.pointer.releaseId}})).toBe(0)
 })
 it('enforces the exact use hash in PostgreSQL, including SQL NULL semantics',async()=>{
  await expect(db.$executeRaw(Prisma.sql`INSERT INTO material_grants(id,teacher_id,resource_type,resource_id,granted_by,authority_grant_id)
   VALUES(${randomUUID()},${fixture.teacher.id},'STANDARD_COMBINATION',${fixture.pointer.releaseId},${fixture.issuer.id},${rootId})`)).rejects.toThrow('standard_combination_hash_required')
 })
 it('compares fresh and transaction-only immutable reuse against identical stored facts with live source state',async()=>{
  const inspector=new Session();inspector.connect()
  const post=(method:string)=>new Promise<any>((resolve,reject)=>inspector.post(method,(error,result)=>error?reject(error):resolve(result)))
  await post('Profiler.enable');await post('Profiler.start')
  const measures=[]
  try{for(const reuse of [false,true]){
   const stage=reuse?'transaction-immutable-reuse':'transaction-fresh-validation',start=performance.now(),cpu=process.cpuUsage(),beforeSql=sql.length
   active=stage
   await db.$transaction(async tx=>{for(let i=0;i<6;i++){
    const source=await readCurrentStandardCombination(tx,fixture.pointer,'HISTORY',reuse)
    expect(source.row.combination_hash).toBe(fixture.pointer.combinationHash)
    expect(source.measurement.contentHash).toBe(fixture.measurement.contentHash)
   }},{timeout:10000})
   active=null
   measures.push({stage,elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu),sql:sql.slice(beforeSql)})
  }}finally{active=null;const result=await post('Profiler.stop');inspector.disconnect()
   await writeFile('/workspace/tool-onboarding-standard-combination-transaction-profile.cpuprofile',JSON.stringify(result.profile),{mode:0o600})}
  const fresh=measures[0].sql,reused=measures[1].sql
  expect(fresh.filter(q=>q.query.includes('SELECT * FROM survey_standard_releases'))).toHaveLength(6)
  expect(reused.filter(q=>q.query.includes('SELECT * FROM survey_standard_releases'))).toHaveLength(1)
  expect(reused.filter(q=>q.query.includes('SELECT id,state,combination_hash,measurement_release'))).toHaveLength(5)
  expect(reused.filter(q=>q.query.includes('SELECT id,status,content_hash,hash_scheme'))).toHaveLength(5)
  await writeFile('/workspace/tool-onboarding-standard-combination-transaction-profile.json',JSON.stringify({pointer:fixture.pointer,measures,
   scope:'same untried immutable source, same PostgreSQL transaction shape; not a positive Training admission qualification'},null,2),{mode:0o600})
  await db.$transaction(async tx=>{
   await readCurrentStandardCombination(tx,fixture.pointer,'HISTORY')
   await tx.$executeRawUnsafe('SAVEPOINT immutable_source_probe')
   await expect(tx.$executeRaw(Prisma.sql`UPDATE survey_standard_releases SET snapshot=jsonb_set(snapshot,'{title}','"changed"'::jsonb) WHERE id=${fixture.pointer.releaseId}`)).rejects.toThrow('Survey approved triplet is immutable')
   await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT immutable_source_probe')
   await tx.$executeRaw(Prisma.sql`UPDATE survey_standard_releases SET state='WITHDRAWN' WHERE id=${fixture.pointer.releaseId}`)
   expect((await readCurrentStandardCombination(tx,fixture.pointer,'HISTORY')).row.state).toBe('WITHDRAWN')
   await expect(readCurrentStandardCombination(tx,fixture.pointer,'COLLECTION')).rejects.toThrow('STANDARD_COMBINATION_NOT_CURRENT')
  })
 })
 it('keeps original 21B authority live when immutable source facts are reused',async()=>{
  const id=randomUUID()
  await issueAdminContentRoot(fixture.system.id,{...proof,tokenVersion:fixture.system.tokenVersion},{requestId:id,expectedVersion:0,reason:'Isolated current-authority probe',grant:{subjectId:fixture.issuer.id,
   scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[fixture.measurement.releaseId]},
   capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
  await db.$transaction(async tx=>{
   await readCurrentStandardCombination(tx,fixture.pointer,'HISTORY')
   await assertLibraryAuthority(tx,fixture.issuer.id,fixture.measurement.releaseId,'material.distribute','TRAINING',id)
   await revokeContentAuthority(tx,{actorId:fixture.system.id,grantId:id,expectedVersion:1,reason:'Synthetic live revocation'})
   await readCurrentStandardCombination(tx,fixture.pointer,'HISTORY')
   await expect(assertLibraryAuthority(tx,fixture.issuer.id,fixture.measurement.releaseId,'material.distribute','TRAINING',id)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  })
 })
 it('retains exact use history and rejects old versions after a synthetic row is revoked and explicitly reissued',async()=>{
  // Raw grant rows here exercise SQL identity/CAS, not admission of the untried
  // fixture. The public grant endpoint above must still reject that source.
  const root=randomUUID(),useId=randomUUID()
  await issueAdminContentRoot(fixture.system.id,{...proof,tokenVersion:fixture.system.tokenVersion},{requestId:root,expectedVersion:0,reason:'Isolated use-history storage probe',grant:{subjectId:fixture.issuer.id,
   scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[fixture.measurement.releaseId]},
   capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
  await db.materialGrant.create({data:{id:useId,teacherId:fixture.teacher.id,resourceType:'STANDARD_COMBINATION',resourceId:fixture.pointer.releaseId,
   grantedBy:fixture.issuer.id,authorityGrantId:root,standardCombinationHash:fixture.pointer.combinationHash}})
  const original={userId:fixture.teacher.id,combination:fixture.pointer,measurementReleaseId:fixture.measurement.releaseId,useGrantId:useId,useGrantVersion:1}
  await db.$transaction(async tx=>{expect((await assertTrainingStandardUse(tx,original)).useGrantVersion).toBe(1)})
  await expect(revokeTrainingStandardCombinationUse(fixture.issuer.id,useId,{expectedVersion:2,reason:'Stale synthetic review'})).rejects.toThrow('版本已变化')
  expect(await revokeTrainingStandardCombinationUse(fixture.issuer.id,useId,{expectedVersion:1,reason:'Synthetic history revocation'})).toMatchObject({version:2,revoked:true})
  await expect(db.$transaction(tx=>assertTrainingStandardUse(tx,original))).rejects.toThrow('使用授权不可用')
  await expect(db.materialGrant.delete({where:{id:useId}})).rejects.toThrow('Exact combination use history must be retained')
  await expect(db.materialGrant.update({where:{id:useId},data:{version:3,revokedAt:null,resourceId:randomUUID()}})).rejects.toThrow('Exact combination resource identity is immutable')
  await db.materialGrant.update({where:{id:useId,version:2,revokedAt:{not:null}},data:{version:3,revokedAt:null}})
  await expect(db.$transaction(tx=>assertTrainingStandardUse(tx,original))).rejects.toThrow('使用授权不可用')
  await db.$transaction(async tx=>{expect((await assertTrainingStandardUse(tx,{...original,useGrantVersion:3})).useGrantVersion).toBe(3)})
 })
 it('rolls back a denied RAW transaction and replays an accepted receipt before any new-use callback',async()=>{
  // Receipt-storage plumbing only: no standard publication, runner, student
  // answer or admissible ONLINE source is fabricated by this SQL test.
  const composite=await db.compositeAssessment.create({data:{code:'receipt-storage-'+randomUUID(),name:'隔离 RAW 存储合同',createdBy:fixture.teacher.id,
   productKind:'QUESTIONNAIRE',questionnaireType:'COURSE'}})
  const parent=await db.compositeAssessmentAttempt.create({data:{compositeAssessmentId:composite.id,participantKey:'synthetic:'+randomUUID(),
   runtimeGeneration:'UNIFIED_V1',frozenActiveSlotSetHash:'a'.repeat(64)},select:REPORT_PARENT_SELECT})
  const input={submissionId:randomUUID(),payloadHash:'b'.repeat(64),answersEncrypted:encryptUnifiedRuntimePayload({syntheticStorageProbe:true}),acceptedAt:new Date(),requiredFormSlots:[]}
  const atomic=process.env.ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED
  process.env.ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED='true'
  try{
   await expect(registerWholeQuestionnaireReceipt(parent,input,async tx=>{await readCurrentStandardCombination(tx,fixture.pointer)})).rejects.toThrow('STANDARD_COMBINATION_NOT_CURRENT')
   expect(await db.compositeReportJob.count({where:{attemptId:parent.id}})).toBe(0)
   expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:parent.id}})).asyncReportEpoch).toBeNull()
   let calls=0
   const receipt=await registerWholeQuestionnaireReceipt(parent,input,async tx=>{
    const [transaction]=await tx.$queryRaw<Array<{id:bigint}>>(Prisma.sql`SELECT txid_current() AS id`)
    expect(transaction.id>0n).toBe(true);calls++
   })
   expect(receipt.replayed).toBe(false);expect(calls).toBe(1)
   const replay=await registerWholeQuestionnaireReceipt(parent,input,async()=>{throw new Error('Accepted receipt must replay before new use')})
   expect(replay.replayed).toBe(true);expect(replay.acceptedAt).toEqual(receipt.acceptedAt)
   const stored=await db.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:parent.id,attemptEpoch:1}}})
   expect(stored.wholePayloadHash).toBe(input.payloadHash);expect(stored.wholeAnswersEncrypted).toBe(input.answersEncrypted)
  }finally{if(atomic===undefined)delete process.env.ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED;else process.env.ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED=atomic}
 })
})
