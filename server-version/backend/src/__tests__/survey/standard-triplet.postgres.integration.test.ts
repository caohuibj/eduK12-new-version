import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import express from 'express'
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import { surveyStartKeys } from '../integration/survey-test-keys'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {platformSurveyOriginGuard} from '../../modules/survey/originGuard'
import {surveyStandardTripletRouter} from '../../modules/survey/standard-triplet.routes'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
import {sourceParts,registeredParts,composeTriplet,type Axis,type Part} from '../../modules/survey/standard-triplet.model'
import {previewStandardTriplet,approveStandardTriplet,standardReleaseRow,runStandardTrial,assertStandardSystem} from '../../modules/survey/standard-triplet.service'
import {grantCatalogSource} from '../../modules/survey/catalog.service'
import {getCatalogSourceSnapshot} from '../../modules/survey/catalog.sources'
import {importCatalogDraft} from '../../modules/survey/builder.service'
import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {startSingleUnlinkedWave} from '../../modules/survey/admission.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {readSurveyCheckpoint,saveSurveyCheckpoint} from '../../modules/survey/checkpoint.service'
import {readGeneralForOwnAttempt,submitResearchFinal} from '../../modules/survey/final.service'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {SurveyComputedFinal} from '../../modules/survey/final.compute'
import {readSurveyStoredReport} from '../../modules/survey/report-results.service'
const suite=process.env.SURVEY_TRIPLET_ISOLATED==='1'?describe:describe.skip
suite('Survey standard workflow on schema-only isolated PostgreSQL',()=>{
 let system:any,manager:any,training:any,owner:string,server:Server,base:string,onlineId:string,pid:string,wid:string,finalId:string,instrumentKey:string
 let opened:Awaited<ReturnType<typeof openWave>>
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),adminAuthenticationMethod:'TOTP' as const}
 const foreignOrigin='http://survey.localhost:5173'
 const sources=listScaleInstrumentSources().filter(s=>s.executable)
 function input(index:number){const source=sources[index],p=Object.fromEntries(sourceParts(source.identity.instrumentKey,source.identity.instrumentVersion).map(p=>[p.axis,p])) as Record<Axis,Part>,triplet=composeTriplet(source.identity.instrumentKey,p);return {toolKey:triplet.toolKey,CONTENT:p.CONTENT.hash,PARAMETERS:p.PARAMETERS.hash,REPORT:p.REPORT.hash,expectedCombinationHash:triplet.combinationHash,requestId:randomUUID(),reason:'Isolated synthetic review only',allowedProducts:['SURVEY']}}
 async function middleTrialSubmission(){
  const [,sample]=await db.$queryRaw<Array<{answers:Record<string,string>}>>`SELECT answers FROM survey_standard_trials WHERE release_id=${onlineId} ORDER BY case_index`
  return {
   submissionId:randomUUID(),
   answers:{[instrumentKey]:sample.answers},
   itemTimings:{[instrumentKey]:Object.fromEntries(Object.keys(sample.answers).map(key=>[key,{schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))},
  }
 }
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
  expect((await call(system,'/onboarding-status',undefined,{},true,foreignOrigin)).status).toBe(403)
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
  expect((await call(system,'/approve',request,{},true,foreignOrigin)).status).toBe(403)
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
  const wave=await createWave(owner,pid,{requestId:randomUUID(),title:'Trial downstream',consentText:'Synthetic isolated trial consent, no human response.',generalText:'Synthetic test.',instrumentIds:[draft.id],allowNewParticipants:true,checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:1}});wid=wave.id
  await prepareWave(owner,pid,wid,wave.revision)
  const frozen=await getWave(owner,pid,wid)
  opened=await openWave(owner,pid,wid,frozen.revision)
  const admitted=await startSingleUnlinkedWave({ ...surveyStartKeys('standard-triplet'),publicId:opened.publicId,waveId:wid,entryToken:opened.entrySecret,consentVersion:1,consent:true})
  const task=await getOwnResearchTask({publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential});instrumentKey=task.units[0].instrumentKey
  await submitResearchFinal({publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential,...await middleTrialSubmission()})
  finalId=(await db.surveyWaveFinal.findFirstOrThrow({where:{projectId:pid}})).id
  const report=await readSurveyStoredReport(owner,{projectId:pid,waveId:wid,finalId,instrumentKey});expect(report.report.blocks.some(b=>b.type==='METRIC')).toBe(true)
  await expect(readSurveyStoredReport(manager.id,{projectId:pid,waveId:wid,finalId,instrumentKey})).rejects.toThrow()
 },60000)
 it('publishes the selected mean report and reads all five actions from anonymous submissions',async()=>{
  const key='academic_self_concept_chinese_zh_cn', parts=registeredParts(key)
  function part(axis:Axis,version:string){
   const row=parts.find(value=>value.axis===axis&&value.version===version)
   if(!row)throw new Error(`Missing ${axis}/${version}`)
   return row
  }
  const selected=composeTriplet(key,{CONTENT:part('CONTENT','1.0.0:1.0.0'),PARAMETERS:part('PARAMETERS','wave1-20261001-v2'),REPORT:part('REPORT','1.3.1')})
  const approved=await approveStandardTriplet(system.id,{toolKey:key,CONTENT:selected.parts.CONTENT.hash,PARAMETERS:selected.parts.PARAMETERS.hash,
   REPORT:selected.parts.REPORT.hash,expectedCombinationHash:selected.combinationHash,requestId:randomUUID(),reason:'Synthetic student mean report',allowedProducts:['SURVEY']})
  expect(approved.state,approved.blockers.join()).toBe('ONLINE')
  const grant=await grantCatalogSource(manager.id,owner,{kind:'SCALE',sourceId:'survey-standard:'+approved.id,sourceVersion:selected.combinationHash})
  const project=await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner,title:'Synthetic mean replay',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await importCatalogDraft(owner,project.id,grant.id,{requestId:randomUUID(),instrumentKey:'reading',title:selected.title})
  await publishSurveyMeasurementDraft(owner,project.id,draft.id,draft.revision)
  const wave=await createWave(owner,project.id,{requestId:randomUUID(),title:'Synthetic reading',consentText:'Synthetic test only, no human response.',
   generalText:'Synthetic receipt',instrumentIds:[draft.id],allowNewParticipants:true})
  await prepareWave(owner,project.id,wave.id,wave.revision,undefined,[{instrumentId:draft.id,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1',
   mode:'DESCRIPTIVE',metricKeys:['academic_self_concept'],release:'AFTER_FINAL'}}])
  const prepared=await getWave(owner,project.id,wave.id),opened=await openWave(owner,project.id,wave.id,prepared.revision)
  async function submitAndRead(values:number[],bandKey:string){
   const mean=values.reduce((sum,value)=>sum+value,0)/values.length
   const admitted=await startSingleUnlinkedWave({...surveyStartKeys('mean-report'),publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true})
   const participant={publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential}
   const answers=Object.fromEntries(values.map((v,i)=>['i_'+i,'o_'+(v-1)]))
   const timings=Object.fromEntries(Object.keys(answers).map(id=>[id,{schemaVersion:1,firstResponseMs:450,activeTimeMs:700,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))
   const final=await submitResearchFinal({...participant,submissionId:randomUUID(),answers:{reading:answers},itemTimings:{reading:timings}})
   const row=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:admitted.attemptId}})
   const saved=decryptUnifiedRuntimePayload<SurveyComputedFinal>(row.resultsCipher)
   expect(canonicalHash(saved)).toBe(row.resultsHash)
   expect(saved.units[0].rawAnswers).toEqual(answers)
   expect(saved.units[0].privateScoring).toMatchObject({scores:[{key:'academic_self_concept',value:mean}]})
   const own=await readGeneralForOwnAttempt(participant)
   if(!('measurements' in own)||own.kind!=='DESCRIPTIVE')throw new Error('Expected disclosed individual report')
   const measurement=own.measurements[0]
   if(!('declaredReport' in measurement)||!measurement.declaredReport)throw new Error('Expected frozen student report after database read')
   expect(saved.interpretation?.units[0].references).toEqual([expect.objectContaining({status:'UNAVAILABLE',reason:'MISSING_CONTEXT'})])
   expect(measurement.declaredReport).toMatchObject({illustrationKey:'chinese-self-concept-door-with-score-actions-v3',
    blocks:expect.arrayContaining([expect.objectContaining({type:'METRIC',value:mean,label:'语文学习自评均分（试用版）'})])})
   const feedback=measurement.declaredReport.blocks.filter(b=>(b as {type:string}).type==='SCORE_FEEDBACK')
   const authored=selected.definition.report.interpretations[0].bands.find(b=>b.key===bandKey)!
   expect(feedback).toEqual([{type:'SCORE_FEEDBACK',metricKey:'academic_self_concept',bandKey,text:authored.label+'\n'+authored.summary,guidance:[]}])
   expect(measurement).not.toHaveProperty('rawScoreFeedback')
   expect(measurement.declaredReport).not.toHaveProperty('standardScoreBands')
   expect(JSON.stringify(measurement.declaredReport)).not.toMatch(/itemScores|rawAnswers|responseValue/)
   expect(final).toMatchObject({participantFeedbackReceipt:{measurements:[{declaredReport:measurement.declaredReport}]}})
   return {report:measurement.declaredReport,hash:row.resultsHash}
  }
  const examples=[
   {answers:[1,1,2,2],key:'very_low'},{answers:[2,2,2,3],key:'low'},
   {answers:[3,3,3,3],key:'middle'},{answers:[3,4,3,4],key:'high'},
   {answers:[4,5,4,5],key:'very_high'},
  ]
  const reports=[]
  for(const example of examples)reports.push(await submitAndRead(example.answers,example.key))
  await expect(submitAndRead([3,4,5],'high')).rejects.toThrow('完整选择有效的响应选项')
  const first=reports[3],second=await submitAndRead([5,2,5,2],'high')
  expect(first.hash).not.toBe(second.hash)
  expect(first.report).toEqual(second.report)
 },60000)
 it('allows explicit no-parameter/no-report approval without inventing feedback',async()=>{const request=input(2);request.PARAMETERS=(await import('../../modules/assessment-runtime/canonical')).canonicalHash(null);request.REPORT=request.PARAMETERS;const p=await previewStandardTriplet(db,system.id,request);expect(p.blockers).toEqual([]);const state=await approveStandardTriplet(system.id,{...request,expectedCombinationHash:p.combinationHash});expect(state.state,state.blockers.join()).toBe('ONLINE');const rows=await db.$queryRaw<any[]>`SELECT report,scores FROM survey_standard_trials WHERE release_id=${state.id}`;expect(rows).toHaveLength(3);expect(rows.every(r=>r.report===null&&r.scores.units.length===1)).toBe(true)})
 it('blocks new admission after withdrawal but lets an admitted participant recover, save and FINAL-submit the frozen version',async()=>{
  const before=await db.surveyWaveFinal.findUniqueOrThrow({where:{id:finalId}}),r=await standardReleaseRow(db,onlineId)
  const entry={publicId:opened.publicId,waveId:wid,entryToken:opened.entrySecret,consentVersion:1,consent:true}
  const startInput={...entry,...surveyStartKeys('before-withdrawal')}
  const admitted=await startSingleUnlinkedWave(startInput)
  const participant={publicId:entry.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential}
  const task=await getOwnResearchTask(participant)
  expect(task.status).toBe('STARTED')
  expect(await db.surveyWaveFinal.count({where:{attemptId:admitted.attemptId}})).toBe(0)

  const withdrawal=await call(system,'/'+onlineId+'/withdraw',{expectedVersion:r.version,reason:'Synthetic withdrawal'})
  expect(withdrawal.status,JSON.stringify(withdrawal.body)).toBe(200)
  expect((await standardReleaseRow(db,onlineId)).state).toBe('WITHDRAWN')
  await expect(getCatalogSourceSnapshot({actorUserId:manager.id,ref:{kind:'SCALE',sourceId:'survey-standard:'+onlineId,sourceVersion:r.combination_hash}},db)).rejects.toThrow()
  const attemptCount=await db.surveyWaveAttempt.count({where:{waveId:wid}})
  await expect(startSingleUnlinkedWave({...entry,...surveyStartKeys('after-withdrawal')})).rejects.toMatchObject({
   statusCode:409,message:expect.stringContaining('停止新入场'),
  })
  expect(await db.surveyWaveAttempt.count({where:{waveId:wid}})).toBe(attemptCount)
  await expect(startSingleUnlinkedWave(startInput)).resolves.toMatchObject({attemptId:admitted.attemptId,recovered:true})
  await expect(getOwnResearchTask(participant)).resolves.toMatchObject({status:'STARTED',definitionDigest:task.definitionDigest,units:task.units})

  const submission=await middleTrialSubmission()
  await expect(saveSurveyCheckpoint(participant,{revision:0,answers:submission.answers,itemTimings:submission.itemTimings})).resolves.toMatchObject({revision:1})
  await expect(readSurveyCheckpoint(participant)).resolves.toMatchObject({revision:1,checkpoint:{answers:submission.answers}})
  await submitResearchFinal({...participant,...submission})
  const completed=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:admitted.attemptId}})
  expect(completed).toMatchObject({publicationId:before.publicationId,definitionDigest:task.definitionDigest,submissionId:submission.submissionId})
  expect((await readSurveyStoredReport(owner,{projectId:pid,waveId:wid,finalId:completed.id,instrumentKey})).report.blocks.some(b=>b.type==='METRIC')).toBe(true)
  await submitResearchFinal({...participant,...submission})
  expect(await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:admitted.attemptId}})).toEqual(completed)
  expect(await db.surveyWaveFinal.findUniqueOrThrow({where:{id:finalId}})).toEqual(before)
  expect((await readSurveyStoredReport(owner,{projectId:pid,waveId:wid,finalId,instrumentKey})).report.blocks.length).toBeGreaterThan(0)
 },60000)
})
