import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import express from 'express'
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {platformSurveyOriginGuard} from '../../modules/survey/originGuard'
import {surveyStandardTripletRouter} from '../../modules/survey/standard-triplet.routes'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
import {sourceParts,composeTriplet,type Axis,type Part} from '../../modules/survey/standard-triplet.model'
import {previewStandardTriplet,approveStandardTriplet,standardReleaseRow,runStandardTrial,withdrawStandardTriplet,assertStandardSystem} from '../../modules/survey/standard-triplet.service'
import {grantCatalogSource} from '../../modules/survey/catalog.service'
import {getCatalogSourceSnapshot} from '../../modules/survey/catalog.sources'
import {importCatalogDraft} from '../../modules/survey/builder.service'
import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {startSingleUnlinkedWave} from '../../modules/survey/admission.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {submitResearchFinal} from '../../modules/survey/final.service'
import {readSurveyStoredReport} from '../../modules/survey/report-results.service'
const suite=process.env.SURVEY_TRIPLET_ISOLATED==='1'?describe:describe.skip
suite('Survey standard workflow on schema-only isolated PostgreSQL',()=>{
 let system:any,manager:any,training:any,owner:string,server:Server,base:string,onlineId:string,pid:string,wid:string,finalId:string,instrumentKey:string
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const sources=listScaleInstrumentSources().filter(s=>s.executable)
 function input(index:number){const source=sources[index],p=Object.fromEntries(sourceParts(source.identity.instrumentKey,source.identity.instrumentVersion).map(p=>[p.axis,p])) as Record<Axis,Part>,triplet=composeTriplet(source.identity.instrumentKey,p);return {toolKey:triplet.toolKey,CONTENT:p.CONTENT.hash,PARAMETERS:p.PARAMETERS.hash,REPORT:p.REPORT.hash,expectedCombinationHash:triplet.combinationHash,requestId:randomUUID(),reason:'Isolated synthetic review only',allowedProducts:['SURVEY']}}
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL!);if(u.port!=='55433'||!(u.pathname.startsWith('/survey_triplet_test_')||/^\/eduk12_ci355_license_entrytriplet_test_[a-f0-9]{10}$/.test(u.pathname)))throw new Error('Schema-only Survey test database required')
  vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))
  const create=(name:string,platformRole:'STANDARD'|'SYSTEM_ADMIN')=>db.user.create({data:{username:name+'-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole,role:'STUDENT'}})
  system=await create('system','SYSTEM_ADMIN');manager=await create('survey','STANDARD');training=await create('training','STANDARD')
  await db.adminEntryGrant.createMany({data:[{id:randomUUID(),userId:manager.id,entry:'SURVEY',grantedBy:system.id},{id:randomUUID(),userId:training.id,entry:'TRAINING',grantedBy:system.id}]})
  owner=(await db.user.create({data:{username:'research-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SURVEY'}})).id
  const login='r'+randomUUID().replace(/-/g,'').slice(0,18)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}});await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:manager.id}});await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic-only'}})
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/platform',platformSurveyOriginGuard);app.use('/api/platform/survey-standard',surveyStandardTripletRouter);app.use(errorHandler)
  server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await (await import('../../config/queue')).closeQueues(true);vi.unstubAllEnvs();await db.$disconnect()})
 async function call(user:any,path:string,body?:unknown,extra:object={},csrf=true,origin='http://localhost:5174'){
  const token=generateToken({userId:user.id,username:user.username,role:user.role,accountDomain:user.accountDomain,tokenVersion:user.tokenVersion,...proof,...extra})
  const response=await fetch(base+'/api/platform/survey-standard'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'ptool_session='+token+'; ptool_csrf=synthetic-csrf','X-CSRF-Token':csrf?'synthetic-csrf':'wrong',Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as any}
 }
 it('allows the highest platform role irrespective of business role and rejects both entry admins',async()=>{expect((await call(system,'/management-design')).status).toBe(200);expect((await call(manager,'/catalog')).status).toBe(403);expect((await call(training,'/catalog')).status).toBe(403);await expect(assertStandardSystem(db,manager.id)).rejects.toMatchObject({statusCode:403})})
 it('exposes uninstalled onboarding versions read-only only to the current system administrator',async()=>{
  const before=await db.scale.count(),response=await call(system,'/onboarding-status')
  expect(response.status).toBe(200)
  const executable=sources[0]
  expect(response.body.data.list).toEqual(expect.arrayContaining([expect.objectContaining({instrumentKey:executable.identity.instrumentKey,instrumentVersion:executable.identity.instrumentVersion,scaleId:null,states:expect.objectContaining({imported:true,deployed:false,published:false,visible:false,trainingEntry:'PENDING',surveyEntry:'PENDING'})})]))
  expect((await call(manager,'/onboarding-status')).status).toBe(403)
  expect((await call(training,'/onboarding-status')).status).toBe(403)
  expect((await call(system,'/onboarding-status',undefined,{tokenVersion:99})).status).toBe(401)
  expect((await call(system,'/onboarding-status',undefined,{},true,'http://training.localhost:5173')).status).toBe(403)
  expect(await db.scale.count()).toBe(before)
 })
 it('rechecks session revocation inside transactional authorization',async()=>{await db.user.update({where:{id:system.id},data:{tokenVersion:1}});try{await expect(db.$transaction(tx=>assertStandardSystem(tx,system.id,{...proof,tokenVersion:0}))).rejects.toMatchObject({statusCode:403})}finally{await db.user.update({where:{id:system.id},data:{tokenVersion:0}})}})
 it('keeps preview read only and rejects stale sessions, stale MFA, CSRF and foreign origins',async()=>{
  const request=input(0),before=await db.$queryRaw`SELECT id FROM survey_standard_releases`
  expect((await call(system,'/preview',{toolKey:request.toolKey,CONTENT:request.CONTENT,PARAMETERS:request.PARAMETERS,REPORT:request.REPORT})).status).toBe(200)
  expect(await db.$queryRaw`SELECT id FROM survey_standard_releases`).toEqual(before)
  expect((await call(system,'/approve',request,{adminVerifiedAt:Math.floor(Date.now()/1000)-301})).status).toBe(403)
  expect((await call(system,'/approve',request,{tokenVersion:99})).status).toBe(401)
  expect((await call(system,'/approve',request,{},false)).status).toBe(403)
  expect((await call(system,'/approve',request,{},true,'http://training.localhost:5173')).status).toBe(403)
 })
 it('approves, computes scores and report, commits and reads back trial rows before ONLINE, with no grants',async()=>{
  const request=input(0),before=await db.$queryRaw`SELECT id FROM survey_tool_grants`
  const p=await previewStandardTriplet(db,system.id,request);expect(p.blockers).toEqual([])
  let result=await approveStandardTriplet(system.id,request);if(result.state==='TRIAL_FAILED')result=await runStandardTrial(system.id,result.id,result.version);onlineId=result.id
  expect(result.state,result.blockers.join()).toBe('ONLINE')
  const trials=await db.$queryRaw<any[]>`SELECT * FROM survey_standard_trials WHERE release_id=${onlineId}`;expect(trials).toHaveLength(3);expect(trials.every(t=>t.scores.units.length===1&&t.report.blocks.length>0)).toBe(true)
  expect(await db.$queryRaw`SELECT id FROM survey_tool_grants`).toEqual(before)
  const again=await approveStandardTriplet(system.id,request);expect(again.latestTrial).toBe(result.latestTrial)
  await expect(approveStandardTriplet(system.id,{...input(1),requestId:result.id})).rejects.toMatchObject({statusCode:409})
  await expect(approveStandardTriplet(system.id,{...input(1),expectedCombinationHash:'f'.repeat(64)})).rejects.toMatchObject({statusCode:409})
 },60000)
 it('records database failure without online or grants, and retries the immutable approval',async()=>{
  await db.$executeRawUnsafe("CREATE FUNCTION triplet_test_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic database failure'; END $$")
  await db.$executeRawUnsafe('CREATE TRIGGER triplet_test_fail BEFORE INSERT ON survey_standard_trials FOR EACH ROW EXECUTE FUNCTION triplet_test_fail_insert()')
  let result:Awaited<ReturnType<typeof approveStandardTriplet>>
  try{result=await approveStandardTriplet(system.id,input(1))}finally{await db.$executeRawUnsafe('DROP TRIGGER triplet_test_fail ON survey_standard_trials');await db.$executeRawUnsafe('DROP FUNCTION triplet_test_fail_insert()')}
  expect(result!.state).toBe('TRIAL_FAILED');expect(result!.blockers.join()).toContain('synthetic database failure');expect((await standardReleaseRow(db,result!.id)).measurement_release).toBeNull()
  const retried=await runStandardTrial(system.id,result!.id,result!.version);expect(retried.state,retried.blockers.join()).toBe('ONLINE')
 },60000)
 it('keeps approval identity, versions and persisted trial rows immutable',async()=>{
  await expect(db.$executeRaw`UPDATE survey_standard_versions SET payload='{}' WHERE tool_key=${sources[0].identity.instrumentKey}`).rejects.toThrow('immutable')
  await expect(db.$executeRaw`UPDATE survey_standard_releases SET snapshot='{}' WHERE id=${onlineId}`).rejects.toThrow('immutable')
  await expect(db.$executeRaw`DELETE FROM survey_standard_trials WHERE release_id=${onlineId}`).rejects.toThrow('immutable')
  await expect(db.$executeRaw`INSERT INTO survey_standard_releases(id,tool_key,combination_hash,snapshot,reference,state,approved_by) VALUES(${randomUUID()},'synthetic','invalid','{}','{}','ONLINE',${system.id})`).rejects.toThrow('before trial')
 })
 it('keeps system out of researcher assignment; explicit Survey grant can freeze and FINAL-score/report the approved triplet',async()=>{
  const r=await standardReleaseRow(db,onlineId),ref={kind:'SCALE' as const,sourceId:'survey-standard:'+onlineId,sourceVersion:r.combination_hash}
  await expect(grantCatalogSource(system.id,owner,ref)).rejects.toMatchObject({statusCode:403})
  const grant=await grantCatalogSource(manager.id,owner,ref)
  pid=randomUUID();await db.surveyProject.create({data:{id:pid,ownerUserId:owner,title:'Isolated standard triplet fixture',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await importCatalogDraft(owner,pid,grant.id,{requestId:randomUUID(),instrumentKey:'approvedscale',title:'Approved synthetic test copy'})
  await publishSurveyMeasurementDraft(owner,pid,draft.id,draft.revision)
  const wave=await createWave(owner,pid,{requestId:randomUUID(),title:'Trial downstream',consentText:'Synthetic isolated trial consent, no human response.',generalText:'Synthetic test.',instrumentIds:[draft.id],allowNewParticipants:true});wid=wave.id
  await prepareWave(owner,pid,wid,wave.revision);const frozen=await getWave(owner,pid,wid),opened=await openWave(owner,pid,wid,frozen.revision)
  const admitted=await startSingleUnlinkedWave({publicId:opened.publicId,waveId:wid,entryToken:opened.entrySecret,consentVersion:1,consent:true})
  const task=await getOwnResearchTask({publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential});instrumentKey=task.units[0].instrumentKey
  const cases=(await db.$queryRaw<any[]>`SELECT answers FROM survey_standard_trials WHERE release_id=${onlineId} ORDER BY case_index`)[1]
  await submitResearchFinal({publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential,submissionId:randomUUID(),answers:{[instrumentKey]:cases.answers},itemTimings:{[instrumentKey]:Object.fromEntries(Object.keys(cases.answers).map(key=>[key,{schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))}})
  finalId=(await db.surveyWaveFinal.findFirstOrThrow({where:{projectId:pid}})).id
  const report=await readSurveyStoredReport(owner,{projectId:pid,waveId:wid,finalId,instrumentKey});expect(report.report.blocks.some(b=>b.type==='METRIC')).toBe(true)
  await expect(readSurveyStoredReport(manager.id,{projectId:pid,waveId:wid,finalId,instrumentKey})).rejects.toThrow()
 },60000)
 it('allows explicit no-parameter/no-report approval without inventing feedback',async()=>{const request=input(2);request.PARAMETERS=(await import('../../modules/assessment-runtime/canonical')).canonicalHash(null);request.REPORT=request.PARAMETERS;const p=await previewStandardTriplet(db,system.id,request);expect(p.blockers).toEqual([]);const state=await approveStandardTriplet(system.id,{...request,expectedCombinationHash:p.combinationHash});expect(state.state,state.blockers.join()).toBe('ONLINE');const rows=await db.$queryRaw<any[]>`SELECT report,scores FROM survey_standard_trials WHERE release_id=${state.id}`;expect(rows).toHaveLength(3);expect(rows.every(r=>r.report===null&&r.scores.units.length===1)).toBe(true)})
 it('withdraws future source use while preserving actual committed FINAL and stored report',async()=>{
  const before=await db.surveyWaveFinal.findUniqueOrThrow({where:{id:finalId}}),r=await standardReleaseRow(db,onlineId)
  await withdrawStandardTriplet(system.id,onlineId,r.version,'Synthetic withdrawal')
  await expect(getCatalogSourceSnapshot({actorUserId:manager.id,ref:{kind:'SCALE',sourceId:'survey-standard:'+onlineId,sourceVersion:r.combination_hash}},db)).rejects.toThrow()
  expect(await db.surveyWaveFinal.findUniqueOrThrow({where:{id:finalId}})).toEqual(before)
  expect((await readSurveyStoredReport(owner,{projectId:pid,waveId:wid,finalId,instrumentKey})).report.blocks.length).toBeGreaterThan(0)
 })
})
